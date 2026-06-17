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

type RalphPhase = "uninitialized" | "idle" | "running" | "stopped";

// The maximum number of worker increments a single `ralph:start` run may
// request. The loop is a sequencer, not a policy engine — this is the one
// loop-shaping knob worth keeping, and it lives as a constant rather than a
// per-worktree config file. Engineering discipline is ambient (delivered via
// the convention skills in pi/agent/skills/conventions/), never configured here.
const MAX_LOOPS_PER_RUN = 20;

type RalphState = {
  version: 1;
  phase: RalphPhase;
  runCount: number;
  currentRunId: string | null;
  objective: string;
  lastUpdatedAt: string;
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
  command: "start";
};

const RALPH_DIR = path.join(".pi", "ralph");
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

const DEFAULT_GOAL = "Deliver scoped increments one at a time until the objective is complete.";

function defaultState(): RalphState {
  return {
    version: 1,
    phase: "uninitialized",
    runCount: 0,
    currentRunId: null,
    objective: "",
    lastUpdatedAt: nowIso(),
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
    `objective=${state.objective || "(unset)"}`,
  ].join(" | ");
}

function ensureArtifacts(cwd: string, goal?: string) {
  const paths = ensureRalphDir(cwd);
  const effectiveGoal = goal?.trim() || DEFAULT_GOAL;

  ensureTextFile(paths.plan, "# Ralph Plan\n\n- [ ] Seed backlog item\n");
  ensureTextFile(
    paths.runbook,
    "# Ralph Runbook\n\n## Build/Test Notes\n\n- Add known-good commands here as loops discover them.\n"
  );
  ensureTextFile(paths.progress, "# Ralph Progress\n\n- No worker increments recorded yet.\n");

  const state = loadState(cwd);
  if (!fs.existsSync(paths.state)) {
    saveState(cwd, {
      ...state,
      phase: "idle",
      objective: effectiveGoal,
    });
  }

  if (!fs.existsSync(paths.history)) {
    fs.writeFileSync(paths.history, "", "utf8");
  }

  return paths;
}

function parseRalphArgs(args: string): { text: string } {
  return { text: args.trim() };
}

function parseStartFlowArgs(input: string): { objective: string; iterations: number } {
  const match = input.match(/(?:--iterations|-n)\s+(\d+)/);
  const requested = match ? Math.max(1, Number(match[1])) : 1;
  const iterations = Math.min(requested, MAX_LOOPS_PER_RUN);
  const objective = input.replace(/(?:--iterations|-n)\s+\d+/, "").trim();
  return { objective, iterations };
}

function getLock(cwd: string): RalphLock | null {
  return readJsonFile(ralphPaths(cwd).lock, null as RalphLock | null);
}

function clearLock(cwd: string) {
  fs.rmSync(ralphPaths(cwd).lock, { force: true });
}

function isActivePhase(phase: RalphPhase): boolean {
  return phase === "running";
}

function canClearStaleLock(state: RalphState): boolean {
  return !isActivePhase(state.phase) && !state.currentRunId;
}

function clearStaleLockIfSafe(cwd: string, state: RalphState): RalphLock | null {
  const lock = getLock(cwd);
  if (!lock || !canClearStaleLock(state)) return null;

  clearLock(cwd);
  appendHistory(cwd, {
    ts: nowIso(),
    runId: lock.runId,
    action: "clear-stale-lock",
    phase: state.phase,
    detail: { lockRunId: lock.runId, stateRunId: state.currentRunId },
  });
  return lock;
}

function formatRalphStatus(state: RalphState, lock: RalphLock | null, staleLockCleared?: RalphLock | null): string {
  return [
    "Ralph status",
    `Phase: ${state.phase}`,
    `Run: ${state.currentRunId ?? "none"}`,
    `Lock: ${lock ? lock.runId ?? "unknown" : "none"}`,
    staleLockCleared ? `Recovered: cleared stale lock ${staleLockCleared.runId ?? "unknown"}` : null,
    `Objective: ${state.objective || "(unset)"}`,
  ].filter(Boolean).join("\n");
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


function registerRalphCommand(
  pi: ExtensionAPI,
  baseName: string,
  description: string,
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
) {
  pi.registerCommand(baseName, { description, handler });
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
            `Durable artifacts: @${path.join(RALPH_DIR, PLAN_FILE)}, @${path.join(RALPH_DIR, RUNBOOK_FILE)}, @${path.join(RALPH_DIR, BRIEF_FILE)}`,
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

  registerRalphCommand(pi, "ralph:start", "Start Ralph v2 workflow (groom → worker loop → summarize)", async (args, ctx) => {
    const parsed = parseRalphArgs(args);

    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);
    clearStaleLockIfSafe(ctx.cwd, state);

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

    if (effectiveState.phase === "running" && effectiveState.currentRunId) {
      ctx.ui.notify("Ralph has an active run from an earlier command. Stop it before starting a new run.", "warning");
      return;
    }


    const startFlow = parseStartFlowArgs(parsed.text);
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


  registerRalphCommand(pi, "ralph:stop", "Stop Ralph loop execution", async (_args, ctx) => {

    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);

    if (state.phase !== "running") {
      ctx.ui.notify("Stop is only available for active runs.", "warning");
      return;
    }
    const nextState: RalphState = { ...state, phase: "stopped", currentRunId: null };

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
      ctx.ui.notify("Ralph has no state in this worktree. Run /ralph:start <objective> first.", "warning");
      return;
    }

    const state = loadState(ctx.cwd);
    const staleLockCleared = clearStaleLockIfSafe(ctx.cwd, state);
    const lock = getLock(ctx.cwd);
    ctx.ui.notify(formatRalphStatus(state, lock, staleLockCleared), "info");
  });

  registerRalphCommand(pi, "ralph:unlock", "Clear a stale Ralph lock when no run is active", async (_args, ctx) => {
    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);
    const lock = getLock(ctx.cwd);

    if (!lock) {
      ctx.ui.notify("Ralph lock is already clear.", "info");
      return;
    }

    if (!canClearStaleLock(state)) {
      ctx.ui.notify(formatRalphStatus(state, lock), "warning");
      return;
    }

    const cleared = clearStaleLockIfSafe(ctx.cwd, state);
    ctx.ui.notify(formatRalphStatus(state, null, cleared), "success");
  });

  registerRalphCommand(pi, "ralph:report", "Generate a concise report of Ralph loop activity", async (_args, ctx) => {
    const paths = ralphPaths(ctx.cwd);
    if (!fs.existsSync(paths.state)) {
      ctx.ui.notify("Ralph has no state in this worktree. Run /ralph:start <objective> first.", "warning");
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
