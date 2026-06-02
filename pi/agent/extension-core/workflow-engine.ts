import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// ── Types ────────────────────────────────────────────────────────────────────

/** How a phase executes its tasks */
export type PhaseExecution = "sequential" | "parallel";

/** What happens after a phase completes */
export type TransitionRule =
  | { type: "advance" }
  | { type: "conditional"; decide: (result: PhaseResult, context: WorkflowContext) => string | null }
  | { type: "loop"; until: (result: PhaseResult, context: WorkflowContext, iteration: number) => boolean };

/** A single unit of work within a phase */
export interface PhaseTask {
  /** Subagent name */
  agent: string;
  /** Instruction template — supports {input}, {context}, {phase:<id>} placeholders */
  task: string;
  /** Optional skills to inject into the subagent */
  skill?: string[];
}

/** Definition of one workflow phase */
export interface PhaseDefinition {
  /** Unique within this workflow */
  id: string;
  /** Human-readable label shown in UI */
  label: string;
  /** Sequential (one agent at a time) or parallel (all at once) */
  execution: PhaseExecution;
  /** Static task list or dynamic function that receives accumulated context */
  tasks: PhaseTask[] | ((context: WorkflowContext) => PhaseTask[]);
  /** What happens after this phase completes */
  transition: TransitionRule;
}

/** Output from a single subagent dispatch */
export interface TaskOutput {
  agent: string;
  result: string;
  status: "success" | "error";
}

/** Result from executing a complete phase */
export interface PhaseResult {
  phaseId: string;
  status: "completed" | "failed";
  outputs: TaskOutput[];
  durationMs: number;
  iteration: number;
}

/** Accumulated state across phases — the engine's runtime memory */
export interface WorkflowContext {
  /** The original user input that triggered the workflow */
  input: string;
  /** All phase results so far, keyed by phase id */
  phases: Record<string, PhaseResult>;
  /** Current phase id, or null if workflow is complete */
  currentPhase: string | null;
  /** Workflow-specific state (extensions can store arbitrary data) */
  state: Record<string, unknown>;
}

/** Full workflow definition — provided by each workflow extension */
export interface WorkflowDefinition {
  /** Workflow identifier (e.g. "tdd", "triage") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description: string;
  /** Ordered list of phases */
  phases: PhaseDefinition[];
  /** Optional: custom context initialization */
  initialize?: (input: string) => Partial<WorkflowContext>;
  /** Optional: custom context formatting for {context} placeholder */
  formatContext?: (context: WorkflowContext) => string;
}

type EngineState = "idle" | "running" | "awaiting_phase" | "completed" | "failed";

// ── Engine ───────────────────────────────────────────────────────────────────

export class WorkflowEngine {
  private context: WorkflowContext;
  private engineState: EngineState = "idle";
  private phaseStartTime = 0;
  private pendingTaskOutputs: TaskOutput[] = [];
  private expectedTaskCount = 0;
  private loopIterations: Record<string, number> = {};
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly definition: WorkflowDefinition,
  ) {
    this.context = this.createInitialContext("");
  }

  // ── Public API ──

  /** Start the workflow with the given user input */
  start(input: string, ctx: ExtensionCommandContext): void {
    if (this.engineState === "running" || this.engineState === "awaiting_phase") {
      if (ctx.hasUI) ctx.ui.notify(`Workflow "${this.definition.name}" is already running.`, "warning");
      return;
    }

    this.context = this.createInitialContext(input);
    this.engineState = "running";
    this.loopIterations = {};
    this.registerEventListeners();

    const firstPhase = this.definition.phases[0];
    if (!firstPhase) {
      this.finish(ctx, "failed", "Workflow has no phases defined.");
      return;
    }

    this.enterPhase(firstPhase.id, ctx);
  }

  /** Get current workflow status */
  getStatus(): { engineState: EngineState; context: WorkflowContext; definition: WorkflowDefinition } {
    return { engineState: this.engineState, context: this.context, definition: this.definition };
  }

  /** Check if the engine is actively running a workflow */
  isActive(): boolean {
    return this.engineState === "running" || this.engineState === "awaiting_phase";
  }

  // ── Context ──

  private createInitialContext(input: string): WorkflowContext {
    const base: WorkflowContext = {
      input,
      phases: {},
      currentPhase: null,
      state: {},
    };

    if (this.definition.initialize) {
      return { ...base, ...this.definition.initialize(input) };
    }

    return base;
  }

  // ── Event listeners ──

  private registerEventListeners(): void {
    this.cleanup();

    // Inject phase instructions into system prompt
    this.pi.on("before_agent_start", (event, ctx) => this.onBeforeAgentStart(event, ctx));

    // Detect subagent completion
    this.pi.on("tool_execution_end", (event) => this.onToolExecutionEnd(event));

    // Detect end of agent turn — evaluate transitions
    this.pi.on("agent_end", (_event, ctx) => this.onAgentEnd(ctx));
  }

  private cleanup(): void {
    // Pi's event system doesn't provide unsubscribe from on(), so we track state instead.
    // When engineState is idle/completed/failed, handlers no-op.
  }

  private onBeforeAgentStart(
    event: { prompt: string; systemPrompt: string },
    _ctx: ExtensionContext,
  ): { systemPrompt?: string } | void {
    if (!this.isActive() || !this.context.currentPhase) return;

    const instructions = this.buildPhaseInstructions();
    if (!instructions) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${instructions}`,
    };
  }

  private onToolExecutionEnd(event: { toolName: string; result: unknown; isError: boolean }): void {
    if (!this.isActive()) return;
    if (event.toolName !== "subagent") return;

    const resultText = extractResultText(event.result);
    this.pendingTaskOutputs.push({
      agent: extractAgentName(event.result) ?? "unknown",
      result: resultText,
      status: event.isError ? "error" : "success",
    });

    this.updatePhaseProgress();
  }

  private onAgentEnd(ctx: ExtensionContext): void {
    if (this.engineState !== "awaiting_phase") return;
    if (!this.context.currentPhase) return;

    // Check if we have enough outputs for the current phase
    if (this.pendingTaskOutputs.length < this.expectedTaskCount) {
      // Not all tasks complete yet — wait for more agent turns
      return;
    }

    this.completeCurrentPhase(ctx);
  }

  // ── Phase management ──

  private enterPhase(phaseId: string, ctx: ExtensionContext): void {
    const phase = this.definition.phases.find((p) => p.id === phaseId);
    if (!phase) {
      this.finish(ctx, "failed", `Unknown phase: ${phaseId}`);
      return;
    }

    this.context.currentPhase = phaseId;
    this.engineState = "awaiting_phase";
    this.phaseStartTime = performance.now();
    this.pendingTaskOutputs = [];

    const tasks = typeof phase.tasks === "function" ? phase.tasks(this.context) : phase.tasks;
    this.expectedTaskCount = tasks.length;

    if (!this.loopIterations[phaseId]) {
      this.loopIterations[phaseId] = 0;
    }
    this.loopIterations[phaseId]++;

    this.updateUI(ctx);

    // Send phase instructions to the LLM
    const message = this.buildPhaseMessage(phase, tasks);
    this.pi.sendUserMessage(message, { deliverAs: "followUp" });
  }

  private completeCurrentPhase(ctx: ExtensionContext): void {
    const phaseId = this.context.currentPhase;
    if (!phaseId) return;

    const phase = this.definition.phases.find((p) => p.id === phaseId);
    if (!phase) return;

    const elapsed = Math.round(performance.now() - this.phaseStartTime);
    const hasErrors = this.pendingTaskOutputs.some((o) => o.status === "error");

    const result: PhaseResult = {
      phaseId,
      status: hasErrors ? "failed" : "completed",
      outputs: [...this.pendingTaskOutputs],
      durationMs: elapsed,
      iteration: this.loopIterations[phaseId] ?? 1,
    };

    this.context.phases[phaseId] = result;

    if (ctx.hasUI) {
      const icon = result.status === "completed" ? "✅" : "⚠️";
      (ctx as { ui: ExtensionContext["ui"] }).ui.notify(
        `${icon} Phase "${phase.label}" ${result.status} (${formatDuration(elapsed)})`,
        result.status === "completed" ? "info" : "warning",
      );
    }

    // Evaluate transition
    this.evaluateTransition(phase, result, ctx);
  }

  private evaluateTransition(phase: PhaseDefinition, result: PhaseResult, ctx: ExtensionContext): void {
    const { transition } = phase;

    switch (transition.type) {
      case "advance": {
        const nextPhase = this.getNextPhase(phase.id);
        if (nextPhase) {
          this.enterPhase(nextPhase.id, ctx);
        } else {
          this.finish(ctx, "completed");
        }
        break;
      }

      case "conditional": {
        const nextPhaseId = transition.decide(result, this.context);
        if (nextPhaseId) {
          this.enterPhase(nextPhaseId, ctx);
        } else {
          this.finish(ctx, "completed");
        }
        break;
      }

      case "loop": {
        const iteration = this.loopIterations[phase.id] ?? 1;
        const done = transition.until(result, this.context, iteration);
        if (done) {
          const nextPhase = this.getNextPhase(phase.id);
          if (nextPhase) {
            this.enterPhase(nextPhase.id, ctx);
          } else {
            this.finish(ctx, "completed");
          }
        } else {
          // Re-enter the same phase
          this.enterPhase(phase.id, ctx);
        }
        break;
      }
    }
  }

  private getNextPhase(currentPhaseId: string): PhaseDefinition | undefined {
    const idx = this.definition.phases.findIndex((p) => p.id === currentPhaseId);
    if (idx < 0 || idx >= this.definition.phases.length - 1) return undefined;
    return this.definition.phases[idx + 1];
  }

  private finish(ctx: ExtensionContext, status: "completed" | "failed", error?: string): void {
    this.engineState = status;
    this.context.currentPhase = null;

    if (ctx.hasUI) {
      if (status === "completed") {
        const totalMs = Object.values(this.context.phases).reduce((sum, p) => sum + p.durationMs, 0);
        const phaseCount = Object.keys(this.context.phases).length;
        (ctx as { ui: ExtensionContext["ui"] }).ui.notify(
          `🎉 Workflow "${this.definition.name}" completed (${phaseCount} phases, ${formatDuration(totalMs)})`,
          "info",
        );
      } else {
        (ctx as { ui: ExtensionContext["ui"] }).ui.notify(
          `❌ Workflow "${this.definition.name}" failed${error ? `: ${error}` : ""}`,
          "error",
        );
      }

      (ctx as { ui: ExtensionContext["ui"] }).ui.setStatus(`workflow-${this.definition.id}`, undefined);
    }
  }

  // ── Instruction generation ──

  private buildPhaseInstructions(): string {
    const phase = this.definition.phases.find((p) => p.id === this.context.currentPhase);
    if (!phase) return "";

    const phaseIndex = this.definition.phases.indexOf(phase);
    const total = this.definition.phases.length;
    const tasks = typeof phase.tasks === "function" ? phase.tasks(this.context) : phase.tasks;

    const lines = [
      `## Active Workflow: ${this.definition.name}`,
      "",
      `**Current phase: ${phase.label}** (phase ${phaseIndex + 1} of ${total})`,
      "",
    ];

    if (phase.execution === "parallel" && tasks.length > 1) {
      lines.push(`Execute ${tasks.length} investigation tracks in parallel using the \`subagent\` tool:`);
      lines.push("");
      for (const task of tasks) {
        const resolved = this.resolveTemplate(task.task);
        lines.push(`- **${task.agent}**: "${resolved}"`);
      }
    } else {
      for (const task of tasks) {
        const resolved = this.resolveTemplate(task.task);
        lines.push(`Execute this phase using the \`subagent\` tool:`);
        lines.push(`- Agent: \`${task.agent}\``);
        lines.push(`- Task: "${resolved}"`);
        if (task.skill && task.skill.length > 0) {
          lines.push(`- Skills: ${task.skill.join(", ")}`);
        }
      }
    }

    lines.push("");
    lines.push("After the subagent(s) complete, summarize the outcome briefly. The workflow engine will advance to the next phase.");
    lines.push("");
    lines.push("**Do not skip phases or execute future phases prematurely.**");

    return lines.join("\n");
  }

  private buildPhaseMessage(phase: PhaseDefinition, tasks: PhaseTask[]): string {
    const phaseIndex = this.definition.phases.indexOf(phase);
    const total = this.definition.phases.length;

    const lines = [
      `**Workflow "${this.definition.name}" — Phase ${phaseIndex + 1}/${total}: ${phase.label}**`,
      "",
    ];

    if (phase.execution === "parallel" && tasks.length > 1) {
      lines.push(`Run these ${tasks.length} investigation tracks in parallel using the \`subagent\` tool with \`tasks\` (parallel mode):`);
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify({
        tasks: tasks.map((t) => ({
          agent: t.agent,
          task: this.resolveTemplate(t.task),
          ...(t.skill ? { skill: t.skill } : {}),
        })),
      }, null, 2));
      lines.push("```");
    } else {
      for (const task of tasks) {
        lines.push(`Use the \`subagent\` tool to execute this phase:`);
        lines.push("");
        lines.push("```json");
        lines.push(JSON.stringify({
          agent: task.agent,
          task: this.resolveTemplate(task.task),
          ...(task.skill ? { skill: task.skill } : {}),
        }, null, 2));
        lines.push("```");
      }
    }

    return lines.join("\n");
  }

  // ── Template resolution ──

  private resolveTemplate(template: string): string {
    let result = template;

    // {input} → original user input
    result = result.replace(/\{input\}/g, this.context.input);

    // {context} → formatted accumulated findings
    result = result.replace(/\{context\}/g, this.formatFindings());

    // {phase:<id>} → output from a specific phase
    result = result.replace(/\{phase:(\w+)\}/g, (_match, phaseId: string) => {
      const phaseResult = this.context.phases[phaseId];
      if (!phaseResult) return `(phase "${phaseId}" has not run yet)`;
      return phaseResult.outputs.map((o) => `[${o.agent}]: ${o.result}`).join("\n\n");
    });

    return result;
  }

  private formatFindings(): string {
    if (this.definition.formatContext) {
      return this.definition.formatContext(this.context);
    }

    const sections: string[] = [];
    for (const [phaseId, result] of Object.entries(this.context.phases)) {
      const phase = this.definition.phases.find((p) => p.id === phaseId);
      const label = phase?.label ?? phaseId;
      for (const output of result.outputs) {
        sections.push(`### ${label} — ${output.agent}\n${output.result}`);
      }
    }

    return sections.join("\n\n") || "(no findings yet)";
  }

  // ── UI ──

  private updateUI(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const phase = this.definition.phases.find((p) => p.id === this.context.currentPhase);
    if (!phase) return;

    const phaseIndex = this.definition.phases.indexOf(phase);
    const total = this.definition.phases.length;

    (ctx as { ui: ExtensionContext["ui"] }).ui.setStatus(
      `workflow-${this.definition.id}`,
      `${phase.label} (${phaseIndex + 1}/${total})`,
    );
  }

  private updatePhaseProgress(): void {
    // Called when a task output arrives — could update a progress counter in the status bar
    // For now, the main status update happens at phase entry/exit
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractResultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    // The subagent tool result structure varies; extract text content
    const r = result as Record<string, unknown>;
    if (typeof r.text === "string") return r.text;
    if (typeof r.content === "string") return r.content;
    if (Array.isArray(r.content)) {
      return r.content
        .filter((c: unknown) => c && typeof c === "object" && (c as Record<string, unknown>).type === "text")
        .map((c: unknown) => (c as Record<string, string>).text)
        .join("\n");
    }
    // Fallback: stringify
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
  return String(result ?? "");
}

function extractAgentName(result: unknown): string | null {
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.agent === "string") return r.agent;
  }
  return null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m${remaining}s`;
}
