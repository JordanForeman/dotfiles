import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { WorkflowExtensionCore } from "../extension-core/workflow-extension-core";
import {
  WorkflowEngine,
  type OutputSummary,
  type PhaseResult,
  type WorkflowContext,
  type WorkflowDefinition,
} from "../extension-core/workflow-engine";

type RalphPhase = "uninitialized" | "idle" | "planning" | "running" | "paused" | "stopped";

type RalphPolicy = {
  mode: "conservative" | "balanced" | "aggressive";
  goal: string;
  maxLoopsPerRun: number;
  maxParallel: {
    recon: number;
    implement: number;
    validate: number;
    plan: number;
  };
  gates: {
    requireSearchBeforeWrite: boolean;
    requireUnitOrScopedTests: boolean;
    requireTypecheck: boolean;
    requireLint: boolean;
    requireSecurityScan: boolean;
  };
  stopConditions: {
    maxConsecutiveFailures: number;
    maxMinutes: number;
    budgetUsd: number;
  };
};

type RalphState = {
  version: 1;
  phase: RalphPhase;
  runCount: number;
  currentRunId: string | null;
  objective: string;
  paused: boolean;
  lastUpdatedAt: string;
  agentMap: {
    planner: string;
    recon: string;
    implement: string;
    validate: string;
    historian: string;
    chain: string;
  };
};

type RalphHistoryEvent = {
  ts: string;
  runId: string | null;
  action: string;
  phase: RalphPhase;
  detail?: Record<string, unknown>;
};

type RalphLock = {
  runId: string | null;
  createdAt: string;
  updatedAt: string;
  command: "start" | "resume" | "retry";
};

const RALPH_DIR = path.join(".pi", "ralph");
const POLICY_FILE = "policy.json";
const STATE_FILE = "state.json";
const PLAN_FILE = "plan.md";
const RUNBOOK_FILE = "runbook.md";
const HISTORY_FILE = "history.jsonl";
const LOCK_FILE = "lock.json";
const BRIEF_FILE = "brief.md";
const PROGRESS_FILE = "progress.md";
const SUMMARY_FILE = "summary.md";
const WORKERS_DIR = "workers";

function nowIso(): string {
  return new Date().toISOString();
}

function ralphPaths(cwd: string) {
  const root = path.join(cwd, RALPH_DIR);
  return {
    root,
    policy: path.join(root, POLICY_FILE),
    state: path.join(root, STATE_FILE),
    plan: path.join(root, PLAN_FILE),
    runbook: path.join(root, RUNBOOK_FILE),
    history: path.join(root, HISTORY_FILE),
    lock: path.join(root, LOCK_FILE),
    brief: path.join(root, BRIEF_FILE),
    progress: path.join(root, PROGRESS_FILE),
    summary: path.join(root, SUMMARY_FILE),
    workers: path.join(root, WORKERS_DIR),
  };
}

function ensureRalphDir(cwd: string) {
  const paths = ralphPaths(cwd);
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.workers, { recursive: true });
  return paths;
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendJsonl(filePath: string, value: unknown) {
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function ensureTextFile(filePath: string, content: string) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, "utf8");
}

function defaultPolicy(goal = "Deliver scoped features with strict validation gates."): RalphPolicy {
  return {
    mode: "balanced",
    goal,
    maxLoopsPerRun: 20,
    maxParallel: {
      recon: 12,
      implement: 4,
      validate: 1,
      plan: 8,
    },
    gates: {
      requireSearchBeforeWrite: true,
      requireUnitOrScopedTests: true,
      requireTypecheck: true,
      requireLint: false,
      requireSecurityScan: false,
    },
    stopConditions: {
      maxConsecutiveFailures: 3,
      maxMinutes: 120,
      budgetUsd: 20,
    },
  };
}

function defaultState(): RalphState {
  return {
    version: 1,
    phase: "uninitialized",
    runCount: 0,
    currentRunId: null,
    objective: "",
    paused: false,
    lastUpdatedAt: nowIso(),
    agentMap: {
      planner: "ralph-planner",
      recon: "ralph-recon",
      implement: "ralph-implementer",
      validate: "ralph-validator",
      historian: "ralph-historian",
      chain: "ralph-loop",
    },
  };
}

function loadState(cwd: string): RalphState {
  const { state } = ralphPaths(cwd);
  return { ...defaultState(), ...readJsonFile(state, defaultState()) };
}

function saveState(cwd: string, state: RalphState) {
  writeJsonFile(ralphPaths(cwd).state, { ...state, lastUpdatedAt: nowIso() });
}

function appendHistory(cwd: string, event: RalphHistoryEvent) {
  appendJsonl(ralphPaths(cwd).history, event);
}

function summarizeState(state: RalphState): string {
  return [
    `phase=${state.phase}`,
    `run=${state.currentRunId ?? "none"}`,
    `paused=${state.paused ? "yes" : "no"}`,
    `objective=${state.objective || "(unset)"}`,
  ].join(" | ");
}

function ensureArtifacts(cwd: string, goal?: string) {
  const paths = ensureRalphDir(cwd);
  const effectiveGoal = goal?.trim() || "Deliver scoped features with strict validation gates.";

  ensureTextFile(paths.plan, "# Ralph Plan\n\n- [ ] Seed backlog item\n");
  ensureTextFile(
    paths.runbook,
    "# Ralph Runbook\n\n## Build/Test Notes\n\n- Add known-good commands here as loops discover them.\n"
  );
  ensureTextFile(paths.progress, "# Ralph Progress\n\n- No worker increments recorded yet.\n");

  if (!fs.existsSync(paths.policy)) {
    writeJsonFile(paths.policy, defaultPolicy(effectiveGoal));
  }

  const state = loadState(cwd);
  if (!fs.existsSync(paths.state)) {
    saveState(cwd, {
      ...state,
      phase: "idle",
      objective: effectiveGoal,
      paused: false,
    });
  }

  if (!fs.existsSync(paths.history)) {
    fs.writeFileSync(paths.history, "", "utf8");
  }

  return paths;
}

function stripAllowMainFlag(args: string): { text: string; allowMain: boolean } {
  const trimmed = args.trim();
  const allowMain = trimmed === "--allow-main" || trimmed.startsWith("--allow-main ");
  const text = allowMain ? trimmed.replace(/^--allow-main\s*/, "").trim() : trimmed;
  return { text, allowMain };
}

function parseStartFlowArgs(input: string, policy?: RalphPolicy): { objective: string; iterations: number } {
  const match = input.match(/(?:--iterations|-n)\s+(\d+)/);
  const requested = match ? Math.max(1, Number(match[1])) : 1;
  const cap = Math.max(1, policy?.maxLoopsPerRun ?? requested);
  const iterations = Math.min(requested, cap);
  const objective = input.replace(/(?:--iterations|-n)\s+\d+/, "").trim();
  return { objective, iterations };
}

function isMainWorktree(cwd: string): boolean {
  try {
    let dir = path.resolve(cwd);

    while (true) {
      const dotGit = path.join(dir, ".git");
      if (fs.existsSync(dotGit)) {
        return fs.statSync(dotGit).isDirectory();
      }

      const parent = path.dirname(dir);
      if (parent === dir) return false;
      dir = parent;
    }
  } catch {
    return false;
  }
}

function assertSafeWorktreeOrNotify(ctx: ExtensionCommandContext, allowMain: boolean): boolean {
  if (allowMain) return true;
  if (!isMainWorktree(ctx.cwd)) return true;

  ctx.ui.notify(
    "Ralph guard: this appears to be the primary worktree. Use a feature worktree or pass --allow-main.",
    "warning"
  );
  return false;
}

function getLock(cwd: string): RalphLock | null {
  return readJsonFile(ralphPaths(cwd).lock, null as RalphLock | null);
}

function saveLock(cwd: string, lock: RalphLock) {
  writeJsonFile(ralphPaths(cwd).lock, lock);
}

function clearLock(cwd: string) {
  const { lock } = ralphPaths(cwd);
  fs.rmSync(lock, { force: true });
}

function upsertLock(cwd: string, command: RalphLock["command"], runId: string | null) {
  const existing = getLock(cwd);
  const lock: RalphLock = {
    runId,
    command,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  saveLock(cwd, lock);
}

function isActivePhase(phase: RalphPhase): boolean {
  return phase === "running" || phase === "paused";
}

function lockConflicts(cwd: string, state: RalphState): boolean {
  const lock = getLock(cwd);
  if (!lock) return false;

  if (!isActivePhase(state.phase)) {
    clearLock(cwd);
    return false;
  }

  const sameRun = lock.runId && state.currentRunId && lock.runId === state.currentRunId;
  return !sameRun;
}

function acquireStartLock(cwd: string, runId: string): boolean {
  const { lock } = ralphPaths(cwd);
  const payload: RalphLock = {
    runId,
    command: "start",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  try {
    const fd = fs.openSync(lock, "wx");
    fs.writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function dispatchCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext, command: string) {
  if (ctx.isIdle()) {
    pi.sendUserMessage(command);
    return;
  }

  pi.sendUserMessage(command, { deliverAs: "followUp" });
}

function quote(input: string): string {
  return input.replace(/"/g, '\\"');
}

function registerRalphCommand(
  pi: ExtensionAPI,
  baseName: string,
  description: string,
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
) {
  for (const name of [baseName, baseName.replace(":", "-")]) {
    pi.registerCommand(name, { description, handler });
  }
}

type RalphSignal = "RALPH_GROOMED" | "RALPH_WORKER_DONE" | "RALPH_COMPLETE" | "RALPH_BLOCKED" | "RALPH_SUMMARY_READY";

const RALPH_SIGNALS: RalphSignal[] = [
  "RALPH_GROOMED",
  "RALPH_WORKER_DONE",
  "RALPH_COMPLETE",
  "RALPH_BLOCKED",
  "RALPH_SUMMARY_READY",
];

function extractRalphSignal(text: string): RalphSignal | null {
  const lineSignal = text.match(/(?:^|\n)\s*(RALPH_GROOMED|RALPH_WORKER_DONE|RALPH_COMPLETE|RALPH_BLOCKED|RALPH_SUMMARY_READY)\s*(?:\n|$)/);
  if (lineSignal) return lineSignal[1] as RalphSignal;

  for (const signal of ["RALPH_BLOCKED", "RALPH_COMPLETE", "RALPH_WORKER_DONE", "RALPH_GROOMED", "RALPH_SUMMARY_READY"] as RalphSignal[]) {
    if (text.includes(signal)) return signal;
  }
  return null;
}

function extractSectionLine(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}:\\s*(.+)`));
  return match?.[1]?.trim() ?? null;
}

function compactRalphSummary(output: string): string {
  const signal = extractRalphSignal(output);
  const fields = [
    "Increment",
    "Changed files",
    "Validation",
    "Artifacts",
    "Next priority",
    "Blocker/decision needed",
  ];
  const lines = [signal, ...fields.map((field) => {
    const value = extractSectionLine(output, field);
    return value ? `${field}: ${value}` : null;
  })].filter(Boolean) as string[];

  if (lines.length > 0) return lines.join("\n");
  return output.trim().split("\n").filter(Boolean).slice(0, 12).join("\n");
}

function summarizeRalphOutput({ output }: { output: string }): OutputSummary {
  const verdict = extractRalphSignal(output) ?? undefined;
  const artifactPath = output.match(/(?:Artifacts?|Output saved to):\s*(.+?)(?:\s*\(|\n|$)/i)?.[1]?.trim();
  const topFindings = [
    extractSectionLine(output, "Increment"),
    extractSectionLine(output, "Validation"),
    extractSectionLine(output, "Next priority"),
    extractSectionLine(output, "Blocker/decision needed"),
  ].filter(Boolean) as string[];

  return {
    verdict,
    summary: compactRalphSummary(output),
    topFindings,
    artifactPath,
  };
}

function firstReceiptSignal(result: PhaseResult): RalphSignal | null {
  for (const output of result.outputs) {
    const receiptSignal = output.receipt.verdict && extractRalphSignal(output.receipt.verdict);
    if (receiptSignal) return receiptSignal;
    const resultSignal = extractRalphSignal(output.result);
    if (resultSignal) return resultSignal;
  }
  return null;
}

function formatRalphContext(context: WorkflowContext): string {
  const workerReceipts = (context.state.workerReceipts as string[] | undefined) ?? [];
  const parts = Object.entries(context.phases).map(([phaseId, result]) => {
    const receipts = result.outputs.map((output) => [
      `${phaseId}/${output.agent}`,
      output.receipt.verdict ? `Signal: ${output.receipt.verdict}` : null,
      output.receipt.artifactPath ? `Artifact: ${output.receipt.artifactPath}` : null,
      output.result,
    ].filter(Boolean).join("\n"));
    return receipts.join("\n\n");
  });

  if (workerReceipts.length > 0) {
    parts.push(`Worker receipts:\n${workerReceipts.join("\n\n")}`);
  }

  return parts.filter(Boolean).join("\n\n");
}

function createRalphWorkflow(opts: { cwd: string; runId: string; objective: string; iterations: number }): WorkflowDefinition {
  return {
    id: "ralph-loop",
    name: "Ralph Loop",
    description: "Groomed autonomous worker loop with compact receipts",
    contextMode: "file-only",
    contextBudget: {
      compactOutputChars: 1200,
      aggregateContextChars: 4000,
      topFindings: 5,
    },
    summarizeOutput: summarizeRalphOutput,
    initialize: (input) => ({
      input,
      state: {
        runId: opts.runId,
        maxIterations: opts.iterations,
        workersRun: 0,
        completed: false,
        blocked: false,
        workerReceipts: [],
      },
    }),
    formatContext: formatRalphContext,
    phases: [
      {
        id: "groom",
        label: "🧹 Groom requirements",
        execution: "sequential",
        contextMode: "file-only",
        tasks: [{
          agent: "ralph-groomer",
          task: [
            `Ralph run: ${opts.runId}`,
            "Objective: {input}",
            `Durable artifacts: @${path.join(RALPH_DIR, POLICY_FILE)}, @${path.join(RALPH_DIR, PLAN_FILE)}, @${path.join(RALPH_DIR, RUNBOOK_FILE)}, @${path.join(RALPH_DIR, BRIEF_FILE)}`,
            "",
            "Groom the objective and repository/project artifacts into @.pi/ralph/brief.md.",
            "Ask broad product/scope/safety questions only via contact_supervisor when available; otherwise emit RALPH_BLOCKED with the needed decision.",
            "Do not implement. End with exactly one signal: RALPH_GROOMED or RALPH_BLOCKED.",
          ].join("\n"),
        }],
        transition: {
          type: "conditional",
          decide: (result, context) => {
            const signal = firstReceiptSignal(result);
            context.state.blocked = signal !== "RALPH_GROOMED";
            return signal === "RALPH_GROOMED" ? "worker" : "summarize";
          },
        },
      },
      {
        id: "worker",
        label: "🔁 Run Ralph worker",
        execution: "sequential",
        contextMode: "file-only",
        tasks: (context) => [{
          agent: "ralph-worker",
          task: [
            `Ralph run: ${opts.runId}`,
            `Worker increment: ${((context.state.workersRun as number | undefined) ?? 0) + 1}/${opts.iterations}`,
            "Objective: {input}",
            "Grooming receipt:",
            "{phase:groom}",
            "Previous compact receipts:",
            "{context}",
            "",
            "Run exactly one complete increment. Keep planning/recon/implementation/validation inside this worker session and durable .pi/ralph artifacts.",
            "End with exactly one terminal signal: RALPH_WORKER_DONE, RALPH_COMPLETE, or RALPH_BLOCKED.",
          ].join("\n"),
        }],
        transition: {
          type: "loop",
          until: (result, context, iteration) => {
            const signal = firstReceiptSignal(result);
            const shouldStop = result.status === "failed" || !signal || signal === "RALPH_COMPLETE" || signal === "RALPH_BLOCKED" || iteration >= opts.iterations;
            context.state.workersRun = iteration;
            context.state.completed = signal === "RALPH_COMPLETE";
            context.state.blocked = result.status === "failed" || !signal || signal === "RALPH_BLOCKED";
            const receipts = (context.state.workerReceipts as string[] | undefined) ?? [];
            receipts.push(result.outputs.map((output) => output.result).join("\n"));
            context.state.workerReceipts = receipts;
            appendHistory(opts.cwd, {
              ts: nowIso(),
              runId: opts.runId,
              action: "worker",
              phase: "running",
              detail: { iteration, signal: signal ?? "missing", status: result.status },
            });
            return shouldStop;
          },
        },
      },
      {
        id: "summarize",
        label: "📝 Summarize Ralph run",
        execution: "sequential",
        contextMode: "file-only",
        tasks: [{
          agent: "ralph-summarizer",
          task: [
            `Finalize Ralph run ${opts.runId}.`,
            "Objective: {input}",
            "Workflow compact receipts:",
            "{context}",
            "",
            "Review @.pi/ralph/*, current diff, and worker artifacts. Write @.pi/ralph/summary.md and emit RALPH_SUMMARY_READY.",
          ].join("\n"),
        }],
        summarizeOutput: (input) => {
          const summary = summarizeRalphOutput(input);
          const state = loadState(opts.cwd);
          const nextPhase: RalphPhase = summary.verdict === "RALPH_SUMMARY_READY" ? "idle" : "stopped";
          saveState(opts.cwd, {
            ...state,
            phase: nextPhase,
            currentRunId: null,
            paused: false,
          });
          clearLock(opts.cwd);
          appendHistory(opts.cwd, {
            ts: nowIso(),
            runId: opts.runId,
            action: "summarize",
            phase: nextPhase,
            detail: { workersRun: input.context.state.workersRun, completed: input.context.state.completed, blocked: input.context.state.blocked },
          });
          return summary;
        },
        transition: { type: "advance" },
      },
    ],
  };
}

function registerRalphLoop(pi: ExtensionAPI) {
  let startEngine: WorkflowEngine | null = null;
  registerRalphCommand(pi, "ralph:init", "Initialize Ralph loop policy and state files", async (args, ctx) => {
    const parsed = stripAllowMainFlag(args);
    if (!assertSafeWorktreeOrNotify(ctx, parsed.allowMain)) return;

    ensureArtifacts(ctx.cwd, parsed.text);
    const state = loadState(ctx.cwd);
    const goal = parsed.text || state.objective || "Deliver scoped features with strict validation gates.";

    const nextState: RalphState = {
      ...state,
      phase: "idle",
      currentRunId: null,
      objective: goal,
      paused: false,
    };

    saveState(ctx.cwd, nextState);
    clearLock(ctx.cwd);
    appendHistory(ctx.cwd, { ts: nowIso(), runId: nextState.currentRunId, action: "init", phase: nextState.phase, detail: { goal } });
    ctx.ui.notify(`Ralph initialized: ${summarizeState(nextState)}`, "success");
  });

  registerRalphCommand(pi, "ralph:start", "Start Ralph v2 workflow (groom → worker loop → summarize)", async (args, ctx) => {
    const parsed = stripAllowMainFlag(args);
    if (!assertSafeWorktreeOrNotify(ctx, parsed.allowMain)) return;

    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);

    if (startEngine?.isActive()) {
      ctx.ui.notify("A Ralph workflow is already running. Wait for it to complete or stop it first.", "warning");
      return;
    }

    let effectiveState = state;

    if (state.phase === "running") {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Ralph appears to be active. Pause or stop before starting a new run.", "warning");
        return;
      }

      effectiveState = {
        ...state,
        phase: "idle",
      };
      saveState(ctx.cwd, effectiveState);
      clearLock(ctx.cwd);
      appendHistory(ctx.cwd, {
        ts: nowIso(),
        runId: state.currentRunId,
        action: "auto-recover-running",
        phase: effectiveState.phase,
      });
    }

    if (effectiveState.phase === "paused" && effectiveState.currentRunId) {
      ctx.ui.notify("Ralph has a paused run. Resume or stop it before starting a new run.", "warning");
      return;
    }


    const policy = readJsonFile(ralphPaths(ctx.cwd).policy, defaultPolicy(effectiveState.objective));
    const startFlow = parseStartFlowArgs(parsed.text, policy);
    const runId = `R-${String(effectiveState.runCount + 1).padStart(4, "0")}`;
    const objective = startFlow.objective || effectiveState.objective || "Execute top priority plan item";
    const iterations = startFlow.iterations;

    if (!acquireStartLock(ctx.cwd, runId)) {
      ctx.ui.notify("Unable to acquire Ralph lock for this worktree. Another run may already be active.", "warning");
      return;
    }

    const nextState: RalphState = {
      ...effectiveState,
      phase: "running",
      runCount: effectiveState.runCount + 1,
      currentRunId: runId,
      paused: false,
      objective,
    };

    saveState(ctx.cwd, nextState);
    appendHistory(ctx.cwd, {
      ts: nowIso(),
      runId,
      action: "start",
      phase: nextState.phase,
      detail: { objective, iterations },
    });


    startEngine = new WorkflowEngine(pi, createRalphWorkflow({ cwd: ctx.cwd, runId, objective, iterations }));
    startEngine.start(objective, ctx);
    ctx.ui.notify(`Ralph workflow started (${runId}, ${iterations} worker${iterations === 1 ? "" : "s"} max)`, "info");
  });

  registerRalphCommand(pi, "ralph:plan", "Refresh Ralph plan using planner subagent", async (args, ctx) => {
    const parsed = stripAllowMainFlag(args);
    if (!assertSafeWorktreeOrNotify(ctx, parsed.allowMain)) return;

    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);

    if (state.phase === "running" || state.phase === "paused") {
      ctx.ui.notify("Cannot re-plan while a run is active. Pause/stop first.", "warning");
      return;
    }

    const objective = parsed.text || state.objective || "Refresh prioritized implementation plan";

    const nextState: RalphState = {
      ...state,
      phase: "planning",
      objective,
      paused: false,
    };

    saveState(ctx.cwd, nextState);
    appendHistory(ctx.cwd, { ts: nowIso(), runId: nextState.currentRunId, action: "plan", phase: nextState.phase, detail: { objective } });

    const task = [
      `Objective: ${objective}`,
      `Use @${path.join(RALPH_DIR, PLAN_FILE)} as source-of-truth backlog.`,
      `Use @${path.join(RALPH_DIR, RUNBOOK_FILE)} for learned commands.`,
      "Re-prioritize top items, deduplicate, and keep entries concise and testable.",
    ].join("\n");

    dispatchCommand(pi, ctx, `/run ${nextState.agentMap.planner} "${quote(task)}"`);
    ctx.ui.notify("Ralph planning dispatched", "info");
  });

  registerRalphCommand(pi, "ralph:retry", "Retry current item with implementer -> validator chain", async (args, ctx) => {
    const parsed = stripAllowMainFlag(args);
    if (!assertSafeWorktreeOrNotify(ctx, parsed.allowMain)) return;

    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);

    if (state.phase !== "running") {
      ctx.ui.notify("Retry is only available while a run is in progress.", "warning");
      return;
    }

    if (!state.currentRunId) {
      ctx.ui.notify("No active run to retry.", "warning");
      return;
    }
    const retryRunId = state.currentRunId;

    const nextState: RalphState = {
      ...state,
      phase: "running",
      paused: false,
    };

    if (lockConflicts(ctx.cwd, state)) {
      ctx.ui.notify("Ralph lock is owned by another run in this worktree.", "warning");
      return;
    }

    saveState(ctx.cwd, nextState);
    upsertLock(ctx.cwd, "retry", retryRunId);
    appendHistory(ctx.cwd, { ts: nowIso(), runId: retryRunId, action: "retry", phase: nextState.phase });

    const implementTask = quote([
      `Retry run ${retryRunId}`,
      `Objective: ${nextState.objective}`,
      `Plan source: @${path.join(RALPH_DIR, PLAN_FILE)}`,
      "Implement only one highest-priority incomplete item.",
    ].join("\n"));

    const validateTask = quote(
      `Validate retry run ${retryRunId} against required gates and classify failures clearly.`
    );

    dispatchCommand(
      pi,
      ctx,
      `/chain ${nextState.agentMap.implement} "${implementTask}" -> ${nextState.agentMap.validate} "${validateTask}"`
    );

    ctx.ui.notify(`Retry chain dispatched for ${retryRunId}`, "info");
  });

  registerRalphCommand(pi, "ralph:pause", "Pause Ralph loop execution", async (args, ctx) => {
    const parsed = stripAllowMainFlag(args);
    if (!assertSafeWorktreeOrNotify(ctx, parsed.allowMain)) return;

    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);

    if (state.phase !== "running") {
      ctx.ui.notify("Pause is only available while Ralph is running.", "warning");
      return;
    }
    const nextState: RalphState = { ...state, phase: "paused", paused: true };

    saveState(ctx.cwd, nextState);
    appendHistory(ctx.cwd, { ts: nowIso(), runId: state.currentRunId, action: "pause", phase: nextState.phase });
    startEngine?.abort(ctx, "paused");
    startEngine = null;

    ctx.abort();
    ctx.ui.notify("Ralph paused", "warning");
  });

  registerRalphCommand(pi, "ralph:resume", "Resume a paused Ralph run", async (args, ctx) => {
    const parsed = stripAllowMainFlag(args);
    if (!assertSafeWorktreeOrNotify(ctx, parsed.allowMain)) return;

    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);

    if (state.phase !== "paused") {
      ctx.ui.notify("Resume is only available when Ralph is paused.", "warning");
      return;
    }

    if (!state.currentRunId) {
      ctx.ui.notify("No paused run to resume.", "warning");
      return;
    }
    const runId = state.currentRunId;

    if (lockConflicts(ctx.cwd, state)) {
      ctx.ui.notify("Ralph lock is owned by another run in this worktree.", "warning");
      return;
    }

    if (startEngine?.isActive()) {
      ctx.ui.notify("A Ralph workflow is already running. Wait for it to complete or stop it first.", "warning");
      return;
    }

    const policy = readJsonFile(ralphPaths(ctx.cwd).policy, defaultPolicy(state.objective));
    const resumeFlow = parseStartFlowArgs(parsed.text, policy);
    const objective = resumeFlow.objective || state.objective || "Continue top priority plan item";
    const iterations = resumeFlow.iterations;
    const nextState: RalphState = { ...state, phase: "running", paused: false, objective };
    saveState(ctx.cwd, nextState);
    upsertLock(ctx.cwd, "resume", runId);

    appendHistory(ctx.cwd, { ts: nowIso(), runId: runId, action: "resume", phase: nextState.phase, detail: { objective, iterations } });

    startEngine = new WorkflowEngine(pi, createRalphWorkflow({ cwd: ctx.cwd, runId: runId, objective, iterations }));
    startEngine.start(objective, ctx);
    ctx.ui.notify(`Ralph resumed (${runId}, ${iterations} worker${iterations === 1 ? "" : "s"} max)`, "info");
  });

  registerRalphCommand(pi, "ralph:stop", "Stop Ralph loop execution", async (args, ctx) => {
    const parsed = stripAllowMainFlag(args);
    if (!assertSafeWorktreeOrNotify(ctx, parsed.allowMain)) return;

    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);

    if (state.phase !== "running" && state.phase !== "paused") {
      ctx.ui.notify("Stop is only available for active or paused runs.", "warning");
      return;
    }
    const nextState: RalphState = { ...state, phase: "stopped", paused: false, currentRunId: null };

    saveState(ctx.cwd, nextState);
    clearLock(ctx.cwd);
    appendHistory(ctx.cwd, { ts: nowIso(), runId: state.currentRunId, action: "stop", phase: nextState.phase });
    startEngine?.abort(ctx, "stopped");
    startEngine = null;

    ctx.abort();
    ctx.ui.notify("Ralph stopped", "warning");
  });

  registerRalphCommand(pi, "ralph:status", "Show current Ralph state", async (_args, ctx) => {
    const paths = ralphPaths(ctx.cwd);
    if (!fs.existsSync(paths.state)) {
      ctx.ui.notify("Ralph is not initialized in this worktree. Run /ralph:init first.", "warning");
      return;
    }

    const state = loadState(ctx.cwd);
    const lock = getLock(ctx.cwd);
    const lockStatus = lock ? ` | lock=${lock.runId ?? "unknown"}` : " | lock=none";
    ctx.ui.notify(`Ralph status: ${summarizeState(state)}${lockStatus}`, "info");
  });

  registerRalphCommand(pi, "ralph:report", "Generate a concise report of Ralph loop activity", async (_args, ctx) => {
    const paths = ralphPaths(ctx.cwd);
    if (!fs.existsSync(paths.state)) {
      ctx.ui.notify("Ralph is not initialized in this worktree. Run /ralph:init first.", "warning");
      return;
    }

    const state = loadState(ctx.cwd);

    const lines = fs.existsSync(paths.history)
      ? fs.readFileSync(paths.history, "utf8").split("\n").filter(Boolean).slice(-20)
      : [];

    const report = [
      "# Ralph Report",
      "",
      `Generated: ${nowIso()}`,
      `State: ${summarizeState(state)}`,
      "",
      "## Recent events",
      ...(lines.length > 0 ? lines.map((line) => `- ${line}`) : ["- (no history yet)"]),
      "",
    ].join("\n");

    const reportPath = path.join(paths.root, `report-${Date.now()}.md`);
    fs.writeFileSync(reportPath, report, "utf8");

    appendHistory(ctx.cwd, {
      ts: nowIso(),
      runId: state.currentRunId,
      action: "report",
      phase: state.phase,
      detail: { reportPath },
    });

    ctx.ui.notify(`Ralph report written: ${path.relative(ctx.cwd, reportPath)}`, "success");
  });
}

class RalphLoopExtension extends WorkflowExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "ralph-loop",
      name: "Ralph Loop",
      summary: "Groomed autonomous worker loop with compact receipts",
    });
  }

  protected registerExtension(): void {
    registerRalphLoop(this.pi);
  }
}

export default function ralphLoop(pi: ExtensionAPI) {
  new RalphLoopExtension(pi).register();
}
