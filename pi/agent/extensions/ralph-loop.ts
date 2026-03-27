import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

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
  };
}

function ensureRalphDir(cwd: string) {
  const paths = ralphPaths(cwd);
  fs.mkdirSync(paths.root, { recursive: true });
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

function parseStartFlowArgs(input: string): { objective: string; iterations: number } {
  const match = input.match(/(?:--iterations|-n)\s+(\d+)/);
  const iterations = match ? Math.max(1, Number(match[1])) : 3;
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

export default function ralphLoop(pi: ExtensionAPI) {
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

  registerRalphCommand(pi, "ralph:start", "Start integrated Ralph flow (plan + iterative execution)", async (args, ctx) => {
    const parsed = stripAllowMainFlag(args);
    if (!assertSafeWorktreeOrNotify(ctx, parsed.allowMain)) return;

    ensureArtifacts(ctx.cwd);
    const state = loadState(ctx.cwd);

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

    const orchestratorPrompt = [
      `You are starting Ralph run ${runId}.`,
      `High-level objective: ${objective}`,
      `Loop iterations to execute: ${iterations}`,
      `Artifacts: @${path.join(RALPH_DIR, POLICY_FILE)}, @${path.join(RALPH_DIR, PLAN_FILE)}, @${path.join(RALPH_DIR, RUNBOOK_FILE)}`,
      "Workflow:",
      "1) Planning mode in this main session: break the objective into prioritized, testable increments in @.pi/ralph/plan.md.",
      "2) If requirements are ambiguous, use ask_user to ask the user concise multiple-choice questions before finalizing the plan.",
      "3) After planning, execute exactly one increment per iteration using sub-sessions via /chain ralph-loop.",
      "4) Before each iteration, re-check priorities from @.pi/ralph/plan.md.",
      "5) Keep @.pi/ralph/plan.md and @.pi/ralph/runbook.md updated after each iteration.",
      "6) Do not execute multiple increments in a single iteration.",
      "Begin now.",
    ].join("\n");

    dispatchCommand(pi, ctx, orchestratorPrompt);
    ctx.ui.notify(`Ralph flow started (${runId})`, "info");
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
    upsertLock(ctx.cwd, "retry", nextState.currentRunId);
    appendHistory(ctx.cwd, { ts: nowIso(), runId: nextState.currentRunId, action: "retry", phase: nextState.phase });

    const implementTask = quote([
      `Retry run ${nextState.currentRunId}`,
      `Objective: ${nextState.objective}`,
      `Plan source: @${path.join(RALPH_DIR, PLAN_FILE)}`,
      "Implement only one highest-priority incomplete item.",
    ].join("\n"));

    const validateTask = quote(
      `Validate retry run ${nextState.currentRunId} against required gates and classify failures clearly.`
    );

    dispatchCommand(
      pi,
      ctx,
      `/chain ${nextState.agentMap.implement} "${implementTask}" -> ${nextState.agentMap.validate} "${validateTask}"`
    );

    ctx.ui.notify(`Retry chain dispatched for ${nextState.currentRunId}`, "info");
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
    appendHistory(ctx.cwd, { ts: nowIso(), runId: nextState.currentRunId, action: "pause", phase: nextState.phase });

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

    if (lockConflicts(ctx.cwd, state)) {
      ctx.ui.notify("Ralph lock is owned by another run in this worktree.", "warning");
      return;
    }

    const nextState: RalphState = { ...state, phase: "running", paused: false };
    saveState(ctx.cwd, nextState);
    upsertLock(ctx.cwd, "resume", nextState.currentRunId);

    appendHistory(ctx.cwd, { ts: nowIso(), runId: nextState.currentRunId, action: "resume", phase: nextState.phase });

    const task = [
      `Resume run ${nextState.currentRunId}`,
      `Objective: ${nextState.objective}`,
      `Plan: @${path.join(RALPH_DIR, PLAN_FILE)}`,
      "Continue with the top incomplete item and validate before completion.",
    ].join("\n");

    dispatchCommand(pi, ctx, `/chain ${nextState.agentMap.chain} "${quote(task)}"`);
    ctx.ui.notify(`Ralph resumed (${nextState.currentRunId})`, "info");
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
