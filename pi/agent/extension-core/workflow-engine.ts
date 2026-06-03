import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// ── Types ────────────────────────────────────────────────────────────────────

/** How a phase executes its tasks */
export type PhaseExecution = "sequential" | "parallel";
export type PhaseContextMode = "full" | "compact" | "file-only" | "none";

export interface WorkflowContextBudget {
  /** Max characters kept for one compacted subagent output */
  compactOutputChars: number;
  /** Max characters injected for the aggregate {context} placeholder */
  aggregateContextChars: number;
  /** Max extracted finding bullets kept per output receipt */
  topFindings: number;
}

export interface OutputSummary {
  /** Compact text injected into later phase context */
  summary?: string;
  /** High-level pass/fail/needs-more-info style signal */
  verdict?: string;
  /** Most important findings surfaced in receipts */
  topFindings?: string[];
  /** Artifact containing the full output, when available */
  artifactPath?: string;
}

export type SummarizeOutputHook = (input: {
  phase: PhaseDefinition;
  task?: PhaseTask;
  output: string;
  agent: string;
  status: TaskOutput["status"];
  context: WorkflowContext;
}) => string | OutputSummary | undefined;

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
  /** Optional name used in receipts when a tool result does not include the agent */
  label?: string;
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
  /** How much of this phase's outputs should be reinjected into later phases */
  contextMode?: PhaseContextMode;
  /** Optional phase-specific output summarizer/receipt extractor */
  summarizeOutput?: SummarizeOutputHook;
  /** Optional overrides for this phase's compaction/truncation budget */
  contextBudget?: Partial<WorkflowContextBudget>;
}

/** Compact receipt for one subagent dispatch */
export interface TaskReceipt {
  agent: string;
  status: "success" | "error";
  artifactPath?: string;
  verdict?: string;
  topFindings: string[];
}

/** Output from a single subagent dispatch */
export interface TaskOutput {
  agent: string;
  /** Context-sized result according to the phase contextMode */
  result: string;
  status: "success" | "error";
  receipt: TaskReceipt;
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
  /** Default context mode for phases that do not specify one */
  contextMode?: PhaseContextMode;
  /** Default compaction/truncation budget */
  contextBudget?: Partial<WorkflowContextBudget>;
  /** Optional workflow-wide output summarizer/receipt extractor */
  summarizeOutput?: SummarizeOutputHook;
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
  private pendingTasks: PhaseTask[] = [];

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

  /** Abort the active workflow without evaluating more phase transitions. */
  abort(ctx?: ExtensionContext, reason = "aborted"): void {
    if (!this.isActive()) return;
    this.engineState = "failed";
    this.context.currentPhase = null;
    this.pendingTaskOutputs = [];
    this.pendingTasks = [];
    this.expectedTaskCount = 0;

    if (ctx?.hasUI) {
      (ctx as { ui: ExtensionContext["ui"] }).ui.setStatus(`workflow-${this.definition.id}`, undefined);
      (ctx as { ui: ExtensionContext["ui"] }).ui.notify(
        `Workflow "${this.definition.name}" ${reason}.`,
        "warning",
      );
    }
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

    const phase = this.definition.phases.find((p) => p.id === this.context.currentPhase);
    if (!phase) return;

    const rawOutput = extractResultText(event.result);
    const taskIndex = this.pendingTaskOutputs.length;
    const task = this.pendingTasks[taskIndex];
    const agent = extractAgentName(event.result) ?? this.fallbackAgentName(phase, task) ?? "unknown";
    this.pendingTaskOutputs.push(
      this.compactTaskOutput({
        phase,
        task,
        rawOutput,
        agent,
        status: event.isError ? "error" : "success",
        toolResult: event.result,
      }),
    );

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
    this.pendingTasks = [];

    const tasks = typeof phase.tasks === "function" ? phase.tasks(this.context) : phase.tasks;
    this.expectedTaskCount = tasks.length;
    this.pendingTasks = tasks;

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

    // {context} → bounded accumulated findings by default
    result = result.replace(/\{context\}/g, this.formatFindings());

    // {phase:<id>} → context-sized output from a specific phase
    result = result.replace(/\{phase:([\w-]+)\}/g, (_match, phaseId: string) => {
      const phaseResult = this.context.phases[phaseId];
      if (!phaseResult) return `(phase "${phaseId}" has not run yet)`;
      return this.formatPhaseForTemplate(phaseId, phaseResult);
    });

    return result;
  }

  private formatFindings(): string {
    const formatted = this.definition.formatContext
      ? this.definition.formatContext(this.context)
      : Object.entries(this.context.phases)
        .map(([phaseId, result]) => this.formatPhaseResult(phaseId, result))
        .filter(Boolean)
        .join("\n\n");

    return truncateText(formatted || "(no findings yet)", this.contextBudget().aggregateContextChars);
  }

  private formatPhaseResult(phaseId: string, result: PhaseResult): string {
    const phase = this.definition.phases.find((p) => p.id === phaseId);
    const label = phase?.label ?? phaseId;
    const sections = result.outputs.map((output) => `### ${label} — ${output.agent}\n${output.result}`);
    return sections.join("\n\n");
  }

  private formatPhaseForTemplate(phaseId: string, result: PhaseResult): string {
    const phase = this.definition.phases.find((p) => p.id === phaseId);
    const formatted = this.formatPhaseResult(phaseId, result);
    const mode = phase?.contextMode ?? this.definition.contextMode ?? "compact";
    if (mode === "full") return formatted;
    return truncateText(formatted, this.contextBudget(phase).aggregateContextChars);
  }

  private compactTaskOutput(input: {
    phase: PhaseDefinition;
    task?: PhaseTask;
    rawOutput: string;
    agent: string;
    status: TaskOutput["status"];
    toolResult: unknown;
  }): TaskOutput {
    const budget = this.contextBudget(input.phase);
    const mode = input.phase.contextMode ?? this.definition.contextMode ?? "compact";
    const defaultSummary = summarizeText(input.rawOutput, budget.compactOutputChars);
    const hookSummary = input.phase.summarizeOutput?.({
      phase: input.phase,
      task: input.task,
      output: input.rawOutput,
      agent: input.agent,
      status: input.status,
      context: this.context,
    }) ?? this.definition.summarizeOutput?.({
      phase: input.phase,
      task: input.task,
      output: input.rawOutput,
      agent: input.agent,
      status: input.status,
      context: this.context,
    });

    const normalized = clampSummary(normalizeSummary(hookSummary), budget);
    const receipt: TaskReceipt = {
      agent: input.agent,
      status: input.status,
      artifactPath: normalized.artifactPath ?? extractArtifactPath(input.toolResult) ?? extractArtifactPath(input.rawOutput) ?? undefined,
      verdict: normalized.verdict ?? extractVerdict(input.rawOutput) ?? undefined,
      topFindings: normalized.topFindings ?? extractTopFindings(input.rawOutput, budget.topFindings),
    };

    const compactResult = renderCompactResult(receipt, normalized.summary ?? defaultSummary);
    const receiptOnly = renderReceipt(receipt);
    const result = mode === "full"
      ? input.rawOutput
      : mode === "compact"
        ? compactResult
        : mode === "file-only"
          ? receiptOnly
          : "(output omitted by phase contextMode: none)";

    return {
      agent: input.agent,
      result,
      status: input.status,
      receipt,
    };
  }

  private contextBudget(phase?: PhaseDefinition): WorkflowContextBudget {
    return {
      ...DEFAULT_CONTEXT_BUDGET,
      ...this.definition.contextBudget,
      ...phase?.contextBudget,
    };
  }

  private fallbackAgentName(phase: PhaseDefinition, task?: PhaseTask): string | null {
    if (phase.execution === "parallel") return null;
    return task?.label ?? task?.agent ?? null;
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
const DEFAULT_CONTEXT_BUDGET: WorkflowContextBudget = {
  compactOutputChars: 4000,
  aggregateContextChars: 12000,
  topFindings: 5,
};


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
function normalizeSummary(summary: string | OutputSummary | undefined): OutputSummary {
  if (typeof summary === "string") return { summary };
  return summary ?? {};
}

function clampSummary(summary: OutputSummary, budget: WorkflowContextBudget): OutputSummary {
  return {
    ...summary,
    summary: summary.summary ? truncateText(summary.summary, budget.compactOutputChars) : undefined,
    topFindings: summary.topFindings
      ?.slice(0, budget.topFindings)
      .map((finding) => truncateText(finding, 240)),
  };
}

function summarizeText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "(no output)";
  return truncateText(trimmed, maxChars);
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `${text.slice(0, Math.max(0, maxChars)).trimEnd()}\n\n…[truncated ${omitted} chars]`;
}

function renderCompactResult(receipt: TaskReceipt, summary: string): string {
  const parts = [renderReceipt(receipt)];
  if (summary) {
    parts.push("", "Summary:", summary);
  }
  return parts.join("\n");
}

function renderReceipt(receipt: TaskReceipt): string {
  const lines = [
    `Receipt: ${receipt.agent} — ${receipt.status}`,
    ...(receipt.artifactPath ? [`Artifact: ${receipt.artifactPath}`] : []),
    ...(receipt.verdict ? [`Verdict: ${receipt.verdict}`] : []),
  ];

  if (receipt.topFindings.length > 0) {
    lines.push("Top findings:");
    for (const finding of receipt.topFindings) {
      lines.push(`- ${finding}`);
    }
  }

  return lines.join("\n");
}

function extractArtifactPath(result: unknown): string | null {
  if (typeof result === "string") {
    return result.match(/Output saved to:\s*(.+?)(?:\s*\(|$)/)?.[1]?.trim() ?? null;
  }

  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    for (const key of ["artifactPath", "outputPath", "path"]) {
      if (typeof r[key] === "string") return r[key];
    }
    if (typeof r.text === "string") return extractArtifactPath(r.text);
    if (typeof r.content === "string") return extractArtifactPath(r.content);
    if (Array.isArray(r.content)) {
      for (const item of r.content) {
        if (item && typeof item === "object") {
          const text = (item as Record<string, unknown>).text;
          if (typeof text === "string") {
            const path = extractArtifactPath(text);
            if (path) return path;
          }
        }
      }
    }
  }

  return null;
}

function extractVerdict(text: string): string | null {
  const marker = text.match(/NEEDS_FURTHER_INVESTIGATION:\s*(.+)/);
  if (marker) return `NEEDS_FURTHER_INVESTIGATION: ${marker[1].trim()}`;

  const verdict = text.match(/(?:^|\n)\s*(?:Verdict|Status|Result):\s*(.+)/i);
  return verdict?.[1]?.trim() ?? null;
}

function extractTopFindings(text: string, maxFindings: number): string[] {
  const findings: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.+)/)?.[1]?.trim();
    if (!bullet) continue;
    findings.push(truncateText(bullet, 240));
    if (findings.length >= maxFindings) break;
  }
  return findings;
}


function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m${remaining}s`;
}
