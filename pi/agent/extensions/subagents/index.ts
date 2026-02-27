import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Message } from "@mariozechner/pi-ai";
import { StringEnum } from "@mariozechner/pi-ai";
import {
  getMarkdownTheme,
  keyHint,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import type { AutocompleteItem } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  discoverOrchestrations,
  getUserOrchestrationDir,
  ORCHESTRATION_LIMITS,
  type OrchestrationConfigDefinition,
  type OrchestrationStageConfig,
} from "./orchestrations.js";
import { createOrchestrationStateEngine } from "./orchestration-machine.js";
import {
  discoverSubagents,
  getUserSubagentDir,
  type SubagentDefinition,
  type SubagentScope,
} from "./registry.js";

const MAX_PARALLEL_TASKS = ORCHESTRATION_LIMITS.maxParallelTasks;
const MAX_CONCURRENCY = ORCHESTRATION_LIMITS.maxConcurrency;
const MAX_ORCHESTRATION_STAGES = ORCHESTRATION_LIMITS.maxStages;
const MAX_TEAMS = 8;
const MAX_TEAM_CONCURRENCY = 4;
const MAX_TEAM_RECORDS = 64;
const COLLAPSED_ITEM_COUNT = 8;
const ACTIVE_WIDGET_KEY = "subagents-active";
const ACTIVE_STATUS_KEY = "subagents";
const CATALOG_STATUS_KEY = "subagents-catalog";

// Lazy-load keyHint to avoid theme initialization errors at import time
let cachedExpandHint: string | null = null;
function getExpandHint(): string {
  if (!cachedExpandHint) {
    try {
      cachedExpandHint = keyHint("expandTools", "to expand");
    } catch (error) {
      // Theme not initialized yet, use fallback
      cachedExpandHint = "(ctrl+o to expand)";
    }
  }
  return cachedExpandHint;
}

// Lazy-load markdown theme to avoid initialization errors
let cachedMarkdownTheme: ReturnType<typeof getMarkdownTheme> | null = null;
function getMarkdownThemeSafe() {
  if (!cachedMarkdownTheme) {
    try {
      cachedMarkdownTheme = getMarkdownTheme();
    } catch (error) {
      // Theme not initialized yet, return undefined to skip markdown rendering
      // This is expected during extension loading and is safe to ignore
      return undefined;
    }
  }
  return cachedMarkdownTheme;
}

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface SubagentRunResult {
  subagent: string;
  source: "user" | "project" | "unknown";
  task: string;
  relation?: string;
  step?: number;
  teamId?: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  provider?: string;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
}

type ExecutionMode = "single" | "parallel" | "chain" | "orchestration" | "teams";
type TeamFailureMode = "continue" | "fail-fast" | "cancel-running";
type TeamStatus = "queued" | "provisioning" | "running" | "succeeded" | "failed" | "cancelled" | "skipped";

interface OrchestrationStageSummary {
  index: number;
  label: string;
  total: number;
  done: number;
  running: number;
  failed: number;
}

interface TeamSummary {
  id: string;
  name: string;
  orchestrationConfig: string;
  status: TeamStatus;
  task: string;
  relation?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeBaseRef?: string;
  error?: string;
  stages?: OrchestrationStageSummary[];
  currentStage?: number;
  preview?: string;
  updatedAt: number;
}

interface TeamRecord extends TeamSummary {
  workflowId: string;
  configSource: "user" | "project";
  configFilePath: string;
  repoRoot?: string;
  results: SubagentRunResult[];
  startedAt?: number;
  endedAt?: number;
}

interface SubagentToolDetails {
  mode: ExecutionMode;
  scope: SubagentScope;
  workflowId: string;
  relation?: string;
  projectRoot: string | null;
  results: SubagentRunResult[];
  stages?: OrchestrationStageSummary[];
  currentStage?: number;
  orchestrationConfig?: {
    name: string;
    source: "user" | "project";
    filePath: string;
  };
  teams?: TeamSummary[];
  teamsFailureMode?: TeamFailureMode;
  teamsConcurrency?: number;
}

interface RuntimeOrchestrationStage {
  label?: string;
  tasks: Array<{
    subagent: string;
    task: string;
    relation?: string;
    cwd?: string;
  }>;
  relation?: string;
  concurrency?: number;
}

interface ResolvedTeamInvocation {
  id: string;
  name: string;
  task: string;
  relation?: string;
  baseRef?: string;
  worktreeParent?: string;
  config: OrchestrationConfigDefinition;
  stages: RuntimeOrchestrationStage[];
}

interface WorkflowStatus {
  title: string;
  lines: string[];
  updatedAt: number;
}

type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, unknown> };

const activeWorkflows = new Map<string, WorkflowStatus>();
const teamRecords = new Map<string, TeamRecord>();
const activeTeamControllers = new Map<string, AbortController>();
const MAX_PROMPT_SUBAGENT_ENTRIES = 24;
const MAX_PROMPT_SUBAGENT_CHARS = 4000;

function composeSubagentCatalogPrompt(cwd: string): {
  text: string;
  count: number;
  truncated: boolean;
} {
  const discovery = discoverSubagents(cwd, "both");
  const subagents = discovery.subagents;

  if (subagents.length === 0) {
    return { text: "", count: 0, truncated: false };
  }

  const lines: string[] = [
    "## Available subagents (runtime discovery)",
    "",
    "Use these specialists proactively when tasks align. For full metadata or freshest diagnostics, call `subagent_list`.",
    "For multi-track execution, use `subagent` teams mode (parallel orchestration runs with isolated worktrees).",
    "",
  ];

  let added = 0;
  let truncated = false;

  for (const item of subagents) {
    const tags = item.tags?.length ? ` tags:${item.tags.join(",")}` : "";
    const line = `- ${item.name} (${item.source}) — ${item.description}${tags}`;

    const nextText = [...lines, line].join("\n");
    if (nextText.length > MAX_PROMPT_SUBAGENT_CHARS || added >= MAX_PROMPT_SUBAGENT_ENTRIES) {
      truncated = true;
      break;
    }

    lines.push(line);
    added += 1;
  }

  if (truncated) {
    lines.push("");
    lines.push("_Additional subagents are available but omitted for prompt-size control. Use `subagent_list` to see all._");
  }

  return {
    text: lines.join("\n"),
    count: added,
    truncated,
  };
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

function formatUsageStats(
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    contextTokens?: number;
    turns?: number;
  },
  model?: string
): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens && usage.contextTokens > 0) parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
  if (model) parts.push(model);
  return parts.join(" ");
}

function modelLabel(provider?: string, model?: string): string | undefined {
  if (!model) return undefined;
  return provider ? `${provider}/${model}` : model;
}

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;

    for (const part of msg.content) {
      if (part.type === "text") return part.text;
    }
  }

  return "";
}

function getDisplayItems(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;

    for (const part of msg.content) {
      if (part.type === "text") {
        items.push({ type: "text", text: part.text });
      }
      if (part.type === "toolCall") {
        items.push({ type: "toolCall", name: part.name, args: part.arguments });
      }
    }
  }

  return items;
}

function formatToolCall(
  toolName: string,
  args: Record<string, unknown>,
  themeFg: (color: any, text: string) => string
): string {
  const shorten = (input: string, max = 60) => (input.length > max ? `${input.slice(0, max)}...` : input);
  const shortenPath = (input: string) => {
    const home = os.homedir();
    return input.startsWith(home) ? `~${input.slice(home.length)}` : input;
  };

  switch (toolName) {
    case "bash": {
      const command = typeof args.command === "string" ? args.command : "...";
      return themeFg("muted", "$ ") + themeFg("toolOutput", shorten(command));
    }
    case "read": {
      const rawPath = (args.path ?? args.file_path ?? "...") as string;
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      let label = themeFg("muted", "read ") + themeFg("accent", shortenPath(rawPath));
      if (offset || limit) {
        const start = offset ?? 1;
        const end = limit ? start + limit - 1 : "";
        label += themeFg("warning", `:${start}${end ? `-${end}` : ""}`);
      }
      return label;
    }
    case "grep": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      const rawPath = typeof args.path === "string" ? args.path : ".";
      return (
        themeFg("muted", "grep ") +
        themeFg("accent", `/${pattern}/`) +
        themeFg("dim", ` in ${shortenPath(rawPath)}`)
      );
    }
    case "find": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "*";
      const rawPath = typeof args.path === "string" ? args.path : ".";
      return (
        themeFg("muted", "find ") +
        themeFg("accent", pattern) +
        themeFg("dim", ` in ${shortenPath(rawPath)}`)
      );
    }
    case "ls": {
      const rawPath = typeof args.path === "string" ? args.path : ".";
      return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
    }
    default:
      return themeFg("accent", toolName) + themeFg("dim", ` ${shorten(JSON.stringify(args), 50)}`);
  }
}

function isFailed(result: SubagentRunResult): boolean {
  return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
}

function summarizeOrchestrationStage(
  stage: Pick<OrchestrationStageSummary, "index" | "label" | "total"> & {
    results: SubagentRunResult[];
  }
): OrchestrationStageSummary {
  const done = stage.results.filter((item) => item.exitCode !== -1).length;
  const running = stage.results.filter((item) => item.exitCode === -1).length;
  const failed = stage.results.filter((item) => item.exitCode !== -1 && isFailed(item)).length;

  return {
    index: stage.index,
    label: stage.label,
    total: stage.total,
    done,
    running,
    failed,
  };
}

function buildTeamPreview(results: SubagentRunResult[]): string | undefined {
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const output = getFinalOutput(results[i].messages).trim();
    if (!output) continue;
    return output.length > 140 ? `${output.slice(0, 140)}...` : output;
  }

  return undefined;
}

function summarizeTeam(record: TeamRecord): TeamSummary {
  return {
    id: record.id,
    name: record.name,
    orchestrationConfig: record.orchestrationConfig,
    status: record.status,
    task: record.task,
    relation: record.relation,
    worktreePath: record.worktreePath,
    worktreeBranch: record.worktreeBranch,
    worktreeBaseRef: record.worktreeBaseRef,
    error: record.error,
    stages: record.stages,
    currentStage: record.currentStage,
    preview: buildTeamPreview(record.results),
    updatedAt: record.updatedAt,
  };
}

function upsertTeamRecord(record: TeamRecord): void {
  const next: TeamRecord = {
    ...record,
    updatedAt: Date.now(),
    stages: record.stages ? record.stages.map((stage) => ({ ...stage })) : undefined,
    results: record.results.map((result) => ({ ...result })),
  };

  teamRecords.set(next.id, next);

  if (teamRecords.size <= MAX_TEAM_RECORDS) return;

  const stale = Array.from(teamRecords.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(MAX_TEAM_RECORDS);

  for (const item of stale) {
    if (activeTeamControllers.has(item.id)) continue;
    teamRecords.delete(item.id);
  }
}

function findTeamRecord(target: string): TeamRecord | undefined {
  const normalized = target.trim().toLowerCase();
  if (!normalized) return undefined;

  const exactId = teamRecords.get(target.trim());
  if (exactId) return exactId;

  return Array.from(teamRecords.values())
    .filter((item) => item.name.toLowerCase() === normalized || item.id.toLowerCase() === normalized)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function buildTeamRelation(baseRelation: string | undefined, team: ResolvedTeamInvocation): string {
  const sections = [
    baseRelation?.trim(),
    `Team objective:\n${team.task.trim()}`,
    team.relation?.trim(),
    team.config.relation?.trim(),
  ].filter((item): item is string => Boolean(item));

  return sections.join("\n\n");
}

function resolveTeamTaskCwd(teamWorktreePath: string, taskCwd: string | undefined): string {
  if (!taskCwd?.trim()) return teamWorktreePath;

  const resolved = path.isAbsolute(taskCwd)
    ? path.resolve(taskCwd)
    : path.resolve(teamWorktreePath, taskCwd.trim());

  if (resolved === teamWorktreePath) return resolved;
  if (resolved.startsWith(`${teamWorktreePath}${path.sep}`)) return resolved;
  return teamWorktreePath;
}

interface TeamWorktreeProvision {
  repoRoot: string;
  worktreePath: string;
  branch: string;
  baseRef: string;
}

interface TeamGitProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

function slugifyTeamName(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/--+/g, "-")
      .replace(/^-+|-+$/g, "") || "team"
  );
}

async function runGitCommand(args: string[], cwd: string, signal?: AbortSignal): Promise<TeamGitProcessResult> {
  return new Promise<TeamGitProcessResult>((resolve, reject) => {
    const proc = spawn("git", args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let aborted = false;

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      reject(error);
    });

    proc.on("close", (code) => {
      if (aborted) {
        reject(new Error("Git command aborted"));
        return;
      }

      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });

    if (signal) {
      const kill = () => {
        aborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 3000);
      };

      if (signal.aborted) kill();
      else signal.addEventListener("abort", kill, { once: true });
    }
  });
}

async function provisionTeamWorktree(params: {
  cwd: string;
  teamName: string;
  teamId: string;
  baseRef?: string;
  worktreeParent?: string;
  signal?: AbortSignal;
}): Promise<TeamWorktreeProvision> {
  const rootResult = await runGitCommand(["rev-parse", "--show-toplevel"], params.cwd, params.signal);

  if (rootResult.code !== 0) {
    const message = rootResult.stderr.trim() || rootResult.stdout.trim() || "Unknown git error";
    throw new Error(`Failed to resolve repository root: ${message}`);
  }

  const repoRoot = rootResult.stdout.trim();
  const repoName = path.basename(repoRoot);
  const teamSlug = slugifyTeamName(params.teamName);
  const suffix = params.teamId.replace(/[^a-zA-Z0-9-]+/g, "").slice(-10) || Date.now().toString(36);

  const worktreeRoot = params.worktreeParent?.trim()
    ? path.resolve(params.cwd, params.worktreeParent.trim())
    : path.join(path.dirname(repoRoot), ".pi-teams", repoName);

  await fs.promises.mkdir(worktreeRoot, { recursive: true });

  const worktreePath = path.join(worktreeRoot, `${teamSlug}-${suffix}`);
  if (fs.existsSync(worktreePath)) {
    throw new Error(`Team worktree path already exists: ${worktreePath}`);
  }

  const branch = `team/${teamSlug}-${suffix}`;
  const baseRef = params.baseRef?.trim() || "HEAD";

  const addResult = await runGitCommand(
    ["worktree", "add", "-b", branch, worktreePath, baseRef],
    repoRoot,
    params.signal
  );

  if (addResult.code !== 0) {
    const message = addResult.stderr.trim() || addResult.stdout.trim() || "Unknown git worktree error";
    throw new Error(`Failed to create team worktree: ${message}`);
  }

  return {
    repoRoot,
    worktreePath,
    branch,
    baseRef,
  };
}

async function removeTeamWorktree(params: {
  repoRoot: string;
  worktreePath: string;
  signal?: AbortSignal;
}): Promise<void> {
  if (!params.worktreePath) return;
  if (!fs.existsSync(params.worktreePath)) return;

  const result = await runGitCommand(
    ["worktree", "remove", "--force", params.worktreePath],
    params.repoRoot,
    params.signal
  );

  if (result.code !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || "Unknown git worktree remove error";
    throw new Error(`Failed to remove team worktree: ${message}`);
  }
}

type OrchestrationExecutionSnapshot = {
  stages: OrchestrationStageSummary[];
  currentStage: number;
  results: SubagentRunResult[];
};

type OrchestrationExecutionResult =
  | {
      ok: true;
      snapshot: OrchestrationExecutionSnapshot;
      finalOutputs: string[];
      previousOutput: string;
    }
  | {
      ok: false;
      snapshot: OrchestrationExecutionSnapshot;
      error: string;
      previousOutput: string;
    };

async function executeOrchestrationRun(args: {
  baseCwd: string;
  subagents: SubagentDefinition[];
  orchestrationStages: RuntimeOrchestrationStage[];
  relation?: string;
  orchestrationConfig?: OrchestrationConfigDefinition;
  signal?: AbortSignal;
  parentModel?: { provider: string; modelId: string };
  resolveTaskCwd?: (taskCwd: string | undefined) => string;
  onProgress?: (message: string, snapshot: OrchestrationExecutionSnapshot) => void;
}): Promise<OrchestrationExecutionResult> {
  const stageStates = args.orchestrationStages.map((stage, index) => ({
    index,
    label: stage.label?.trim() || `stage-${index + 1}`,
    total: stage.tasks.length,
    results: [] as SubagentRunResult[],
  }));

  const orchestrationState = createOrchestrationStateEngine(
    stageStates.map((stage) => ({
      label: stage.label,
      total: stage.total,
    }))
  );

  const resolveTaskCwd =
    args.resolveTaskCwd ??
    ((taskCwd: string | undefined) => taskCwd ?? args.orchestrationConfig?.cwd ?? args.baseCwd);

  orchestrationState.start();
  orchestrationState.send({ type: "START" });

  const getSnapshot = (): OrchestrationExecutionSnapshot => {
    const snapshot = orchestrationState.getState();
    return {
      stages: snapshot.stages,
      currentStage: snapshot.currentStage,
      results: stageStates.flatMap((stage) => stage.results),
    };
  };

  try {
    let previousOutput = "";

    for (let stageIndex = 0; stageIndex < args.orchestrationStages.length; stageIndex += 1) {
      const stage = args.orchestrationStages[stageIndex];
      const stageRelation = stage.relation ?? args.relation;
      const stageCount = args.orchestrationStages.length;
      const concurrency = Math.max(1, Math.min(stage.concurrency ?? MAX_CONCURRENCY, MAX_CONCURRENCY));

      stageStates[stageIndex].results = stage.tasks.map((item) => ({
        subagent: item.subagent,
        source: "unknown",
        task: item.task.replace(/\{previous\}/g, previousOutput),
        relation: item.relation ?? stageRelation,
        step: stageIndex + 1,
        exitCode: -1,
        messages: [],
        stderr: "",
        usage: makeUsage(),
      }));

      orchestrationState.send({ type: "STAGE_STARTED", stageIndex });
      const initialSummary = summarizeOrchestrationStage(stageStates[stageIndex]);
      orchestrationState.send({
        type: "STAGE_PROGRESS",
        stageIndex,
        done: initialSummary.done,
        running: initialSummary.running,
        failed: initialSummary.failed,
      });

      args.onProgress?.(
        `Orchestration stage ${stageIndex + 1}/${stageCount} running (${stageStates[stageIndex].label})`,
        getSnapshot()
      );

      const stageResults = await mapWithConcurrencyLimit(stage.tasks, concurrency, async (item, taskIndex) => {
        const task = item.task.replace(/\{previous\}/g, previousOutput);

        const result = await runSingleSubagent(
          args.baseCwd,
          args.subagents,
          {
            subagent: item.subagent,
            task,
            relation: item.relation ?? stageRelation,
            cwd: resolveTaskCwd(item.cwd),
            step: stageIndex + 1,
          },
          args.signal,
          (partial) => {
            stageStates[stageIndex].results[taskIndex] = partial;
            const stageSummary = summarizeOrchestrationStage(stageStates[stageIndex]);
            orchestrationState.send({
              type: "STAGE_PROGRESS",
              stageIndex,
              done: stageSummary.done,
              running: stageSummary.running,
              failed: stageSummary.failed,
            });

            const snapshot = getSnapshot();
            const stageProgress = snapshot.stages?.[stageIndex];
            const progress = stageProgress
              ? `${stageProgress.done}/${stageProgress.total} complete`
              : `task ${taskIndex + 1}`;

            args.onProgress?.(`Orchestration stage ${stageIndex + 1}/${stageCount}: ${progress}`, snapshot);
          },
          args.parentModel
        );

        stageStates[stageIndex].results[taskIndex] = result;
        const stageSummary = summarizeOrchestrationStage(stageStates[stageIndex]);
        orchestrationState.send({
          type: "STAGE_PROGRESS",
          stageIndex,
          done: stageSummary.done,
          running: stageSummary.running,
          failed: stageSummary.failed,
        });

        args.onProgress?.(
          `Orchestration stage ${stageIndex + 1}/${stageCount}: ${stageStates[stageIndex].label}`,
          getSnapshot()
        );

        return result;
      });

      stageStates[stageIndex].results = stageResults;

      const stageSummary = summarizeOrchestrationStage(stageStates[stageIndex]);
      orchestrationState.send({
        type: "STAGE_PROGRESS",
        stageIndex,
        done: stageSummary.done,
        running: stageSummary.running,
        failed: stageSummary.failed,
      });

      const failed = stageResults.find((item) => isFailed(item));
      const successfulOutputs = stageResults
        .filter((item) => !isFailed(item))
        .map((item) => getFinalOutput(item.messages).trim())
        .filter(Boolean);
      previousOutput = successfulOutputs.join("\n\n");

      if (failed) {
        const error = failed.errorMessage || failed.stderr || getFinalOutput(failed.messages) || "(no output)";
        orchestrationState.send({ type: "STAGE_FAILED", stageIndex, error });
        return {
          ok: false,
          error,
          snapshot: getSnapshot(),
          previousOutput,
        };
      }

      orchestrationState.send({
        type: "STAGE_COMPLETED",
        stageIndex,
        previousOutput,
      });
    }

    orchestrationState.send({ type: "COMPLETE" });
    const finalOutputs = stageStates[stageStates.length - 1]?.results
      .map((item) => getFinalOutput(item.messages).trim())
      .filter(Boolean);

    return {
      ok: true,
      snapshot: getSnapshot(),
      finalOutputs: finalOutputs ?? [],
      previousOutput,
    };
  } finally {
    orchestrationState.stop();
  }
}

function toWorkflowLines(details: SubagentToolDetails): string[] {
  if (details.mode === "single") {
    const result = details.results[0];
    if (!result) return ["starting..."];

    if (result.exitCode === -1) {
      const items = getDisplayItems(result.messages);
      const last = items[items.length - 1];
      if (last?.type === "toolCall") return [`${result.subagent}: ${last.name}`];
      if (last?.type === "text") return [`${result.subagent}: ${last.text.split("\n")[0]}`];
      return [`${result.subagent}: running...`];
    }

    const status = isFailed(result) ? "failed" : "done";
    return [`${result.subagent}: ${status}`];
  }

  if (details.mode === "orchestration") {
    const stages = details.stages ?? [];
    if (stages.length === 0) return ["orchestration: starting..."];

    const completedStages = stages.filter((stage) => stage.total > 0 && stage.done >= stage.total).length;
    const currentIndex = details.currentStage ?? Math.min(completedStages, stages.length - 1);
    const stage = stages[currentIndex];

    if (!stage) {
      return [`orchestration: ${completedStages}/${stages.length} stages complete`];
    }

    const stageStatus =
      stage.running > 0
        ? `${stage.done}/${stage.total} done, ${stage.running} running`
        : stage.done === 0
          ? "pending"
          : stage.failed > 0
            ? `${stage.done}/${stage.total} done, ${stage.failed} failed`
            : "done";

    return [
      `orchestration: ${completedStages}/${stages.length} stages complete`,
      `stage ${stage.index + 1}: ${stage.label} (${stageStatus})`,
    ];
  }

  if (details.mode === "teams") {
    const teams = details.teams ?? [];
    if (teams.length === 0) return ["teams: starting..."];

    const complete = teams.filter((team) =>
      ["succeeded", "failed", "cancelled", "skipped"].includes(team.status)
    ).length;
    const running = teams.filter((team) => team.status === "running" || team.status === "provisioning").length;
    const failed = teams.filter((team) => team.status === "failed").length;

    const active = teams.find((team) => team.status === "running" || team.status === "provisioning");

    const headline = `teams: ${complete}/${teams.length} complete, ${running} running`;
    if (!active) {
      return [headline, `status: ${failed} failed`];
    }

    if (active.status === "provisioning") {
      return [headline, `${active.name}: provisioning worktree`];
    }

    const stages = active.stages ?? [];
    const current = stages[Math.max(0, Math.min(active.currentStage ?? 0, stages.length - 1))];
    if (!current) {
      return [headline, `${active.name}: running`];
    }

    return [
      headline,
      `${active.name}: stage ${current.index + 1} (${current.done}/${current.total} done, ${current.running} running)`,
    ];
  }

  const running = details.results.filter((result) => result.exitCode === -1).length;
  const done = details.results.filter((result) => result.exitCode !== -1).length;
  return [`${details.mode}: ${done}/${details.results.length} done, ${running} running`];
}

function renderActiveWidget(ctx: { hasUI: boolean; ui: ExtensionCommandContext["ui"] }): void {
  if (!ctx.hasUI) return;

  if (activeWorkflows.size === 0) {
    ctx.ui.setWidget(ACTIVE_WIDGET_KEY, undefined);
    ctx.ui.setStatus(ACTIVE_STATUS_KEY, undefined);
    return;
  }

  const workflows = Array.from(activeWorkflows.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  const lines: string[] = ["Subagent workflows"];

  for (const workflow of workflows.slice(0, 3)) {
    lines.push(`• ${workflow.title}`);
    for (const line of workflow.lines.slice(0, 2)) {
      lines.push(`  ${line}`);
    }
  }

  if (workflows.length > 3) {
    lines.push(`… +${workflows.length - 3} more workflows`);
  }

  ctx.ui.setWidget(ACTIVE_WIDGET_KEY, lines);
  ctx.ui.setStatus(
    ACTIVE_STATUS_KEY,
    `⚙ ${activeWorkflows.size} delegation workflow${activeWorkflows.size === 1 ? "" : "s"}`
  );
}

function updateWorkflow(
  ctx: { hasUI: boolean; ui: ExtensionCommandContext["ui"] },
  workflowId: string,
  title: string,
  lines: string[]
): void {
  activeWorkflows.set(workflowId, { title, lines, updatedAt: Date.now() });
  renderActiveWidget(ctx);
}

function clearWorkflow(ctx: { hasUI: boolean; ui: ExtensionCommandContext["ui"] }, workflowId: string): void {
  activeWorkflows.delete(workflowId);
  renderActiveWidget(ctx);
}

function abortActiveTeams(): void {
  for (const controller of activeTeamControllers.values()) {
    controller.abort();
  }
  activeTeamControllers.clear();
}

function writePromptToTempFile(subagentName: string, prompt: string): { dir: string; filePath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
  const safeName = subagentName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const filePath = path.join(dir, `prompt-${safeName}.md`);
  fs.writeFileSync(filePath, prompt, { encoding: "utf8", mode: 0o600 });
  return { dir, filePath };
}

function makeUsage(): UsageStats {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    contextTokens: 0,
    turns: 0,
  };
}

function makeUnknownResult(subagent: string, task: string, relation?: string, step?: number): SubagentRunResult {
  return {
    subagent,
    source: "unknown",
    task,
    relation,
    step,
    exitCode: 1,
    messages: [],
    stderr: "Unknown subagent",
    usage: makeUsage(),
  };
}

function buildDelegatedPrompt(task: string, relation?: string): string {
  const chunks = ["Delegated task:", task.trim()];

  if (relation?.trim()) {
    chunks.push("Parent session context:");
    chunks.push(relation.trim());
  }

  chunks.push("Return findings and recommendations for the parent agent. Be explicit about uncertainty.");
  return chunks.join("\n\n");
}

type PartialUpdateCallback = (result: SubagentRunResult) => void;

function getParentModelInfo(
  ctx: ExtensionContext
): { provider: string; modelId: string } | undefined {
  if (!ctx.model) return undefined;
  return {
    provider: ctx.model.provider,
    modelId: ctx.model.id,
  };
}

async function runSingleSubagent(
  baseCwd: string,
  subagents: SubagentDefinition[],
  args: {
    subagent: string;
    task: string;
    relation?: string;
    cwd?: string;
    step?: number;
  },
  signal: AbortSignal | undefined,
  onUpdate?: PartialUpdateCallback,
  parentModel?: { provider: string; modelId: string }
): Promise<SubagentRunResult> {
  const subagent = subagents.find((item) => item.name === args.subagent);

  if (!subagent) {
    return {
      ...makeUnknownResult(args.subagent, args.task, args.relation, args.step),
      stderr: `Unknown subagent: ${args.subagent}`,
    };
  }

  // Use parent session's model if subagent doesn't specify one
  const effectiveProvider = subagent.provider || parentModel?.provider;
  const effectiveModel = subagent.model || parentModel?.modelId;

  const result: SubagentRunResult = {
    subagent: subagent.name,
    source: subagent.source,
    task: args.task,
    relation: args.relation,
    step: args.step,
    exitCode: -1,
    messages: [],
    stderr: "",
    usage: makeUsage(),
    provider: effectiveProvider,
    model: effectiveModel,
  };

  const commandArgs: string[] = ["--mode", "json", "-p", "--no-session"];
  if (effectiveProvider) commandArgs.push("--provider", effectiveProvider);
  if (effectiveModel) commandArgs.push("--model", effectiveModel);
  if (subagent.tools?.length) commandArgs.push("--tools", subagent.tools.join(","));

  let tempDir: string | null = null;
  let promptPath: string | null = null;

  if (subagent.systemPrompt.trim()) {
    const temp = writePromptToTempFile(subagent.name, subagent.systemPrompt);
    tempDir = temp.dir;
    promptPath = temp.filePath;
    commandArgs.push("--append-system-prompt", promptPath);
  }

  commandArgs.push(buildDelegatedPrompt(args.task, args.relation));
  onUpdate?.(result);

  try {
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn("pi", commandArgs, {
        cwd: args.cwd ?? baseCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";

      const processLine = (line: string) => {
        if (!line.trim()) return;

        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "message_end" && event.message) {
          const message = event.message as Message;
          result.messages.push(message);

          if (message.role === "assistant") {
            result.usage.turns += 1;
            const usage = message.usage;

            if (usage) {
              result.usage.input += usage.input || 0;
              result.usage.output += usage.output || 0;
              result.usage.cacheRead += usage.cacheRead || 0;
              result.usage.cacheWrite += usage.cacheWrite || 0;
              result.usage.cost += usage.cost?.total || 0;
              result.usage.contextTokens = usage.totalTokens || 0;
            }

            if (!result.provider && message.provider) result.provider = message.provider;
            if (!result.model && message.model) result.model = message.model;
            if (message.stopReason) result.stopReason = message.stopReason;
            if (message.errorMessage) result.errorMessage = message.errorMessage;
          }

          onUpdate?.(result);
        }

        if (event.type === "tool_result_end" && event.message) {
          result.messages.push(event.message as Message);
          onUpdate?.(result);
        }
      };

      proc.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (chunk) => {
        result.stderr += chunk.toString();
      });

      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });

      proc.on("error", () => resolve(1));

      if (signal) {
        const killProcess = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, 5000);
        };

        if (signal.aborted) killProcess();
        else signal.addEventListener("abort", killProcess, { once: true });
      }
    });

    result.exitCode = exitCode;
    if (wasAborted) throw new Error("Subagent invocation aborted");
    return result;
  } finally {
    if (promptPath) {
      try {
        fs.unlinkSync(promptPath);
      } catch {
        // ignore cleanup errors
      }
    }
    if (tempDir) {
      try {
        fs.rmdirSync(tempDir);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>
): Promise<TOut[]> {
  if (items.length === 0) return [];

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let next = 0;

  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

const ScopeSchema = StringEnum(["user", "project", "both"] as const, {
  default: "user",
  description: "Subagent scope. user=~/.pi/agent/subagents, project=.pi/agent/subagents",
});

const SingleModeSchema = Type.Object({
  subagent: Type.String({ description: "Subagent name" }),
  task: Type.String({ description: "Delegated task" }),
  relation: Type.Optional(Type.String({ description: "How this task relates to the parent session" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the subagent process" })),
});

const ParallelItemSchema = Type.Object({
  subagent: Type.String({ description: "Subagent name" }),
  task: Type.String({ description: "Delegated task" }),
  relation: Type.Optional(Type.String({ description: "How this task relates to the parent session" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the subagent process" })),
});

const ChainItemSchema = Type.Object({
  subagent: Type.String({ description: "Subagent name" }),
  task: Type.String({ description: "Delegated task. Use {previous} to inject prior step output." }),
  relation: Type.Optional(Type.String({ description: "How this step relates to the parent session" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the subagent process" })),
});

const OrchestrationStageSchema = Type.Object({
  label: Type.Optional(Type.String({ description: "Optional stage label shown in widgets/results" })),
  tasks: Type.Array(ParallelItemSchema, {
    minItems: 1,
    maxItems: MAX_PARALLEL_TASKS,
    description: "Tasks in this stage run in parallel",
  }),
  relation: Type.Optional(Type.String({ description: "Default relation for all tasks in this stage" })),
  concurrency: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_CONCURRENCY,
      description: `Per-stage concurrency limit (1-${MAX_CONCURRENCY})`,
    })
  ),
});

const TeamFailureModeSchema = StringEnum(["continue", "fail-fast", "cancel-running"] as const, {
  default: "continue",
  description: "How teams behave when one team fails",
});

const TeamItemSchema = Type.Object({
  name: Type.String({ description: "Team name shown in status widgets and /teams" }),
  orchestrationConfig: Type.String({ description: "Named orchestration config for this team" }),
  task: Type.String({ description: "Concrete objective delegated to this team" }),
  relation: Type.Optional(Type.String({ description: "Additional relation context for this team" })),
  baseRef: Type.Optional(Type.String({ description: "Git ref to branch from when creating the team worktree" })),
  worktreeParent: Type.Optional(
    Type.String({ description: "Optional directory under which the team worktree is created" })
  ),
  orchestrationConfigScope: Type.Optional(
    StringEnum(["user", "project", "both"] as const, {
      default: "both",
      description: "Scope used to resolve this team's orchestration config",
    })
  ),
});

const SubagentListParams = Type.Object({
  scope: Type.Optional(ScopeSchema),
  includePrompt: Type.Optional(
    Type.Boolean({
      default: false,
      description: "Include the raw system prompt in details for orchestration/debugging",
    })
  ),
});

const SubagentInvokeParams = Type.Object({
  subagent: Type.Optional(Type.String({ description: "Subagent name (single mode)" })),
  task: Type.Optional(Type.String({ description: "Delegated task (single mode)" })),
  relation: Type.Optional(Type.String({ description: "How this invocation relates to the parent session" })),
  tasks: Type.Optional(Type.Array(ParallelItemSchema, { description: "Parallel mode" })),
  chain: Type.Optional(Type.Array(ChainItemSchema, { description: "Chain mode" })),
  orchestration: Type.Optional(
    Type.Array(OrchestrationStageSchema, {
      minItems: 1,
      maxItems: MAX_ORCHESTRATION_STAGES,
      description: "Multi-stage orchestration mode (serial stages, parallel tasks per stage)",
    })
  ),
  orchestrationConfig: Type.Optional(
    Type.String({
      description:
        "Named orchestration config from ~/.pi/agent/subagents/orchestrations or .pi/agent/subagents/orchestrations",
    })
  ),
  orchestrationConfigScope: Type.Optional(
    StringEnum(["user", "project", "both"] as const, {
      default: "both",
      description: "Scope for orchestration config discovery",
    })
  ),
  teams: Type.Optional(
    Type.Array(TeamItemSchema, {
      minItems: 1,
      maxItems: MAX_TEAMS,
      description: "Run multiple named teams (each team runs an orchestration config in its own worktree)",
    })
  ),
  teamsConcurrency: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_TEAM_CONCURRENCY,
      default: 2,
      description: `Number of teams to run concurrently (1-${MAX_TEAM_CONCURRENCY})`,
    })
  ),
  teamsFailureMode: Type.Optional(TeamFailureModeSchema),
  scope: Type.Optional(ScopeSchema),
  confirmProjectSubagents: Type.Optional(
    Type.Boolean({
      default: true,
      description: "Prompt before using project-local subagents",
    })
  ),
  cwd: Type.Optional(Type.String({ description: "Working directory for single mode" })),
});

function parseScope(value: string | undefined): SubagentScope | undefined {
  if (!value) return undefined;
  if (value === "user" || value === "project" || value === "both") return value;
  return undefined;
}

function normalizeOrchestrationStages(stages: OrchestrationStageConfig[]): RuntimeOrchestrationStage[] {
  return stages.map((stage) => ({
    label: stage.label?.trim() || undefined,
    relation: stage.relation?.trim() || undefined,
    concurrency: stage.concurrency,
    tasks: stage.tasks.map((task) => ({
      subagent: task.subagent,
      task: task.task,
      relation: task.relation?.trim() || undefined,
      cwd: task.cwd?.trim() || undefined,
    })),
  }));
}

function resolveOrchestrationConfigByName(
  cwd: string,
  scope: SubagentScope,
  name: string
): {
  config?: OrchestrationConfigDefinition;
  diagnostics: string[];
  projectRoot: string | null;
  error?: string;
} {
  const discovery = discoverOrchestrations(cwd, scope);
  const target = name.trim().toLowerCase();

  if (!target) {
    return {
      diagnostics: discovery.diagnostics,
      projectRoot: discovery.projectRoot,
      error: "orchestrationConfig must be a non-empty name.",
    };
  }

  const config = discovery.orchestrations.find((item) => item.name.toLowerCase() === target);
  if (!config) {
    const available = discovery.orchestrations.map((item) => item.name).join(", ") || "(none)";
    return {
      diagnostics: discovery.diagnostics,
      projectRoot: discovery.projectRoot,
      error: `Orchestration config not found: ${name}. Available: ${available}`,
    };
  }

  return {
    config,
    diagnostics: discovery.diagnostics,
    projectRoot: discovery.projectRoot,
  };
}

function usageCommandText(): string {
  return [
    "Usage:",
    "  /subagents list [user|project|both]",
    "  /subagents show <name> [user|project|both]",
    "  /subagents paths",
    "  /subagents scaffold <name> [description]",
    "  /subagents orchestrate <config-name> <task/relation>",
    "  /subagents team <config-name> <team::task> [|| team::task ...]",
    "  /subagents orchestration list [user|project|both]",
    "  /subagents orchestration show <name> [user|project|both]",
    "  /subagents orchestration paths",
    "  /subagents orchestration scaffold <name> [description]",
    "  /teams list|show|cancel|cleanup|do|create",
  ].join("\n");
}

async function scaffoldSubagent(name: string, description?: string): Promise<string> {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) throw new Error("Subagent name must contain letters or numbers.");

  const dir = getUserSubagentDir();
  const filePath = path.join(dir, `${slug}.md`);

  if (fs.existsSync(filePath)) {
    throw new Error(`Subagent already exists: ${filePath}`);
  }

  const body = [
    "---",
    `name: ${slug}`,
    `description: ${description?.trim() || "Describe what this subagent specializes in"}`,
    "tools: read, grep, find, ls",
    "provider: openai-codex",
    "model: gpt-5.3-codex",
    "tags: scaffold",
    "---",
    "",
    `You are ${slug}, a focused subagent.`,
    "",
    "Responsibilities:",
    "- Stay tightly scoped to the delegated task.",
    "- Surface relevant evidence (files, commands, excerpts).",
    "- Return a concise summary for the parent agent.",
    "",
    "Constraints:",
    "- Do not assume unstated context.",
    "- Highlight uncertainty or missing data.",
    "",
  ].join("\n");

  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, body, "utf8");
  return filePath;
}

async function scaffoldOrchestrationConfig(name: string, description?: string): Promise<string> {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) throw new Error("Orchestration name must contain letters or numbers.");

  const dir = getUserOrchestrationDir();
  const filePath = path.join(dir, `${slug}.json`);

  if (fs.existsSync(filePath)) {
    throw new Error(`Orchestration config already exists: ${filePath}`);
  }

  const config = {
    name: slug,
    description: description?.trim() || "Describe this orchestration workflow",
    relation: "How this orchestration supports the parent objective",
    scope: "both",
    confirmProjectSubagents: true,
    stages: [
      {
        label: "research",
        tasks: [
          {
            subagent: "planner",
            task: "Identify constraints and acceptance criteria",
          },
        ],
      },
      {
        label: "synthesis",
        tasks: [
          {
            subagent: "planner",
            task: "Produce final recommendation using:\n\n{previous}",
          },
        ],
      },
    ],
  };

  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return filePath;
}

function createWorkflowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeResults(results: SubagentRunResult[]): string {
  return results
    .map((result) => {
      const output = getFinalOutput(result.messages).trim();
      const preview = output ? `${output.slice(0, 100)}${output.length > 100 ? "..." : ""}` : "(no output)";
      const status = isFailed(result) ? "failed" : "ok";
      return `[${result.subagent}] ${status}: ${preview}`;
    })
    .join("\n\n");
}

const COMMAND_SUBCOMMANDS = [
  "list",
  "show",
  "paths",
  "scaffold",
  "orchestrate",
  "team",
  "orchestration",
  "orchestrations",
  "help",
];
const ORCHESTRATION_COMMAND_SUBCOMMANDS = ["list", "show", "paths", "scaffold", "help"];
const TEAM_COMMAND_SUBCOMMANDS = ["list", "show", "cancel", "cleanup", "do", "create", "help"];
const SCOPE_VALUES: SubagentScope[] = ["user", "project", "both"];

type CompletionInput = {
  tokens: string[];
  currentIndex: number;
  currentLower: string;
};

function parseCompletionInput(prefix: string): CompletionInput {
  const trimmed = prefix.trimStart();
  if (!trimmed) {
    return { tokens: [""], currentIndex: 0, currentLower: "" };
  }

  const endsWithWhitespace = /\s$/.test(trimmed);
  const tokens = trimmed.split(/\s+/);
  if (endsWithWhitespace) tokens.push("");

  const currentIndex = Math.max(0, tokens.length - 1);
  const currentLower = (tokens[currentIndex] ?? "").toLowerCase();

  return { tokens, currentIndex, currentLower };
}

function makeCompletionItems(input: CompletionInput, candidates: string[]): AutocompleteItem[] | null {
  const filtered = candidates
    .filter((candidate) => candidate.toLowerCase().startsWith(input.currentLower))
    .sort((a, b) => a.localeCompare(b));

  if (filtered.length === 0) return null;

  const baseTokens = input.tokens.slice(0, input.currentIndex);
  return filtered.map((candidate) => {
    const value = [...baseTokens, candidate].join(" ");
    return { value, label: value };
  });
}

function discoverOrchestrationNamesForCompletion(): string[] {
  try {
    return discoverOrchestrations(process.cwd(), "both").orchestrations.map((item) => item.name);
  } catch {
    return [];
  }
}

function discoverSubagentNamesForCompletion(): string[] {
  try {
    return discoverSubagents(process.cwd(), "both").subagents.map((item) => item.name);
  } catch {
    return [];
  }
}

function discoverTeamIdentifiersForCompletion(includeAll = false): string[] {
  const records = Array.from(teamRecords.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  const names = new Set<string>();

  for (const record of records) {
    names.add(record.id);
    names.add(record.name);
  }

  if (includeAll) names.add("all");
  return Array.from(names);
}

function getTeamsCommandCompletions(prefix: string): AutocompleteItem[] | null {
  const input = parseCompletionInput(prefix);

  if (input.currentIndex === 0) {
    return makeCompletionItems(input, TEAM_COMMAND_SUBCOMMANDS);
  }

  const command = (input.tokens[0] ?? "").toLowerCase();

  if (command === "show" || command === "cancel") {
    if (input.currentIndex === 1) {
      return makeCompletionItems(input, discoverTeamIdentifiersForCompletion(false));
    }
    return null;
  }

  if (command === "cleanup") {
    if (input.currentIndex === 1) {
      return makeCompletionItems(input, discoverTeamIdentifiersForCompletion(true));
    }
    return null;
  }

  return null;
}

function getSubagentCommandCompletions(prefix: string): AutocompleteItem[] | null {
  const input = parseCompletionInput(prefix);
  const rootCommand = (input.tokens[0] ?? "").toLowerCase();

  if (input.currentIndex === 0) {
    return makeCompletionItems(input, COMMAND_SUBCOMMANDS);
  }

  if (rootCommand === "list") {
    if (input.currentIndex === 1) return makeCompletionItems(input, SCOPE_VALUES);
    return null;
  }

  if (rootCommand === "show") {
    if (input.currentIndex === 1) {
      return makeCompletionItems(input, discoverSubagentNamesForCompletion());
    }
    if (input.currentIndex === 2) return makeCompletionItems(input, SCOPE_VALUES);
    return null;
  }

  if (rootCommand === "orchestrate") {
    if (input.currentIndex === 1) {
      return makeCompletionItems(input, discoverOrchestrationNamesForCompletion());
    }
    return null;
  }

  if (rootCommand === "team") {
    if (input.currentIndex === 1) {
      return makeCompletionItems(input, discoverOrchestrationNamesForCompletion());
    }
    return null;
  }

  if (rootCommand === "orchestration" || rootCommand === "orchestrations") {
    if (input.currentIndex === 1) {
      return makeCompletionItems(input, ORCHESTRATION_COMMAND_SUBCOMMANDS);
    }

    const action = (input.tokens[1] ?? "").toLowerCase();

    if (action === "list") {
      if (input.currentIndex === 2) return makeCompletionItems(input, SCOPE_VALUES);
      return null;
    }

    if (action === "show") {
      if (input.currentIndex === 2) {
        return makeCompletionItems(input, discoverOrchestrationNamesForCompletion());
      }
      if (input.currentIndex === 3) return makeCompletionItems(input, SCOPE_VALUES);
      return null;
    }

    return null;
  }

  return null;
}

export default function subagentsExtension(pi: ExtensionAPI) {
  pi.on("input", async (event) => {
    const text = event.text.trim();
    if (!text || text.startsWith("/")) return { action: "continue" as const };
    if (event.source === "extension") return { action: "continue" as const };

    const lower = text.toLowerCase();
    const requestsTeamMode =
      lower.includes("make a team") ||
      lower.includes("create a team") ||
      lower.includes("team for yourself") ||
      lower.includes("with a team") ||
      lower.includes("use a team") ||
      lower.includes("spin up a team");

    if (!requestsTeamMode) return { action: "continue" as const };

    const suffix = [
      "",
      "[team execution intent detected]",
      "Use subagent teams mode for this request.",
      "Ensure each team runs in a dedicated git worktree and keep /teams list|show|cancel|cleanup as the control surface.",
    ].join("\n");

    return {
      action: "transform" as const,
      text: `${event.text.trim()}${suffix}`,
      images: event.images,
    };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const catalog = composeSubagentCatalogPrompt(ctx.cwd);

    if (ctx.hasUI) {
      const suffix = catalog.truncated ? "+" : "";
      ctx.ui.setStatus(CATALOG_STATUS_KEY, `subagents: ${catalog.count}${suffix}`);
    }

    if (!catalog.text) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${catalog.text}`,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    activeWorkflows.clear();
    teamRecords.clear();
    abortActiveTeams();
    if (ctx.hasUI) {
      ctx.ui.setWidget(ACTIVE_WIDGET_KEY, undefined);
      ctx.ui.setStatus(ACTIVE_STATUS_KEY, undefined);
      ctx.ui.setStatus(CATALOG_STATUS_KEY, undefined);
    }
  });

  pi.on("session_switch", async (_event, ctx) => {
    activeWorkflows.clear();
    teamRecords.clear();
    abortActiveTeams();
    if (ctx.hasUI) {
      ctx.ui.setWidget(ACTIVE_WIDGET_KEY, undefined);
      ctx.ui.setStatus(ACTIVE_STATUS_KEY, undefined);
      ctx.ui.setStatus(CATALOG_STATUS_KEY, undefined);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    activeWorkflows.clear();
    teamRecords.clear();
    abortActiveTeams();
    if (ctx.hasUI) {
      ctx.ui.setWidget(ACTIVE_WIDGET_KEY, undefined);
      ctx.ui.setStatus(ACTIVE_STATUS_KEY, undefined);
      ctx.ui.setStatus(CATALOG_STATUS_KEY, undefined);
    }
  });

  pi.registerCommand("subagents", {
    description: "Manage subagent definitions, orchestration configs, and team launch shortcuts",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => getSubagentCommandCompletions(prefix),
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const input = (args ?? "").trim();
      if (!input) {
        ctx.ui.notify(usageCommandText(), "info");
        return;
      }

      const [commandRaw, ...rest] = input.split(/\s+/);
      const command = commandRaw.toLowerCase();

      if (command === "help") {
        ctx.ui.notify(usageCommandText(), "info");
        return;
      }

      if (command === "orchestrate") {
        if (!rest[0]) {
          ctx.ui.notify("Usage: /subagents orchestrate <config-name> <task/relation>", "warning");
          return;
        }

        const configName = rest[0];
        const relationText = rest.slice(1).join(" ").trim();
        const resolved = resolveOrchestrationConfigByName(ctx.cwd, "both", configName);

        if (!resolved.config) {
          const diagnostics =
            resolved.diagnostics.length > 0
              ? `\nDiagnostics:\n${resolved.diagnostics.map((item) => `- ${item}`).join("\n")}`
              : "";
          ctx.ui.notify(`${resolved.error || "Failed to resolve orchestration config."}${diagnostics}`, "error");
          return;
        }

        const payload = {
          orchestrationConfig: resolved.config.name,
          orchestrationConfigScope: "both",
          relation:
            relationText ||
            resolved.config.relation ||
            `Execute orchestration config \"${resolved.config.name}\" for the parent objective.`,
        };

        const request = [
          "Invoke the subagent tool now with this exact JSON:",
          "```json",
          JSON.stringify(payload, null, 2),
          "```",
          "Do not modify the JSON.",
        ].join("\n");

        if (ctx.isIdle()) {
          pi.sendUserMessage(request);
        } else {
          pi.sendUserMessage(request, { deliverAs: "followUp" });
        }

        ctx.ui.notify(`Queued orchestration: ${resolved.config.name}`, "info");
        return;
      }

      if (command === "team") {
        if (!rest[0]) {
          ctx.ui.notify("Usage: /subagents team <config-name> <team::task> [|| team::task ...]", "warning");
          return;
        }

        const configName = rest[0];
        const resolved = resolveOrchestrationConfigByName(ctx.cwd, "both", configName);

        if (!resolved.config) {
          const diagnostics =
            resolved.diagnostics.length > 0
              ? `\nDiagnostics:\n${resolved.diagnostics.map((item) => `- ${item}`).join("\n")}`
              : "";
          ctx.ui.notify(`${resolved.error || "Failed to resolve orchestration config."}${diagnostics}`, "error");
          return;
        }

        const afterCommand = input.slice(commandRaw.length).trim();
        const specsRaw = afterCommand.slice(configName.length).trim();

        if (!specsRaw) {
          ctx.ui.notify(
            "Provide team specs after the config name. Example: /subagents team feature-dev-pipeline api::Build API || ui::Build UI",
            "warning"
          );
          return;
        }

        const segments = specsRaw
          .split(/\s*\|\|\s*/)
          .map((item) => item.trim())
          .filter(Boolean);

        if (segments.length === 0) {
          ctx.ui.notify("No team specs were parsed.", "warning");
          return;
        }

        const names = new Set<string>();
        const teams: Array<{ name: string; orchestrationConfig: string; task: string }> = [];

        for (const [index, segment] of segments.entries()) {
          const marker = segment.indexOf("::");
          const fallbackName = `team-${index + 1}`;

          let name = fallbackName;
          let task = segment;

          if (marker >= 0) {
            const parsedName = segment.slice(0, marker).trim();
            const parsedTask = segment.slice(marker + 2).trim();
            if (parsedName) name = parsedName;
            task = parsedTask;
          }

          const stripWrappingQuotes = (value: string): string => {
            const trimmed = value.trim();
            if (trimmed.length < 2) return trimmed;
            if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).trim();
            if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).trim();
            return trimmed;
          };

          task = stripWrappingQuotes(task);
          if (!task) {
            ctx.ui.notify(`Team spec ${index + 1} is missing a task.`, "warning");
            return;
          }

          let unique = name;
          let suffix = 2;
          while (names.has(unique.toLowerCase())) {
            unique = `${name}-${suffix}`;
            suffix += 1;
          }
          names.add(unique.toLowerCase());

          teams.push({
            name: unique,
            orchestrationConfig: resolved.config.name,
            task,
          });
        }

        const payload = {
          teams,
          teamsConcurrency: Math.max(1, Math.min(2, teams.length)),
          teamsFailureMode: "continue",
          relation:
            resolved.config.relation ||
            `Execute orchestration config \"${resolved.config.name}\" across ${teams.length} teams for the parent objective.`,
        };

        const request = [
          "Invoke the subagent tool now with this exact JSON:",
          "```json",
          JSON.stringify(payload, null, 2),
          "```",
          "Do not modify the JSON.",
        ].join("\n");

        if (ctx.isIdle()) {
          pi.sendUserMessage(request);
        } else {
          pi.sendUserMessage(request, { deliverAs: "followUp" });
        }

        ctx.ui.notify(`Queued ${teams.length} teams using orchestration: ${resolved.config.name}`, "info");
        return;
      }

      if (command === "orchestration" || command === "orchestrations") {
        const orchestrationAction = (rest[0] ?? "list").toLowerCase();
        const orchestrationRest = rest.slice(1);

        if (orchestrationAction === "help") {
          ctx.ui.notify(
            [
              "Usage:",
              "  /subagents orchestration list [user|project|both]",
              "  /subagents orchestration show <name> [user|project|both]",
              "  /subagents orchestration paths",
              "  /subagents orchestration scaffold <name> [description]",
            ].join("\n"),
            "info"
          );
          return;
        }

        if (orchestrationAction === "paths") {
          const discovery = discoverOrchestrations(ctx.cwd, "both");
          const lines = [
            "Orchestration config search paths:",
            ...discovery.userDirs.map((dir) => `- user: ${dir}`),
            ...discovery.projectDirs.map((dir) => `- project: ${dir}`),
            `project root: ${discovery.projectRoot ?? "(none)"}`,
          ];
          ctx.ui.notify(lines.join("\n"), "info");
          return;
        }

        if (orchestrationAction === "list") {
          const scope = parseScope(orchestrationRest[0]) ?? "both";
          const discovery = discoverOrchestrations(ctx.cwd, scope);

          if (discovery.orchestrations.length === 0) {
            ctx.ui.notify(`No orchestration configs found for scope \"${scope}\".`, "warning");
            return;
          }

          const lines = discovery.orchestrations.map((item) => {
            const stages = item.stages.length;
            return `- ${item.name} (${item.source}) — ${item.description} stages:${stages}`;
          });

          ctx.ui.notify(`Orchestrations (${scope}):\n${lines.join("\n")}`, "info");
          return;
        }

        if (orchestrationAction === "show") {
          if (!orchestrationRest[0]) {
            ctx.ui.notify("Usage: /subagents orchestration show <name> [scope]", "warning");
            return;
          }

          const targetName = orchestrationRest[0].toLowerCase();
          const scope = parseScope(orchestrationRest[1]) ?? "both";
          const discovery = discoverOrchestrations(ctx.cwd, scope);
          const found = discovery.orchestrations.find((item) => item.name.toLowerCase() === targetName);

          if (!found) {
            ctx.ui.notify(`Orchestration config not found: ${orchestrationRest[0]} (scope: ${scope})`, "warning");
            return;
          }

          const lines = [
            `${found.name} (${found.source})`,
            found.description,
            `path: ${found.filePath}`,
            `scope default: ${found.scope ?? "(inherits tool scope)"}`,
            `confirmProjectSubagents: ${found.confirmProjectSubagents ?? true}`,
            `stages: ${found.stages.length}`,
          ];

          for (const [index, stage] of found.stages.entries()) {
            lines.push(`  ${index + 1}. ${stage.label?.trim() || `stage-${index + 1}`} (${stage.tasks.length} tasks)`);
          }

          ctx.ui.notify(lines.join("\n"), "info");
          return;
        }

        if (orchestrationAction === "scaffold") {
          if (!orchestrationRest[0]) {
            ctx.ui.notify("Usage: /subagents orchestration scaffold <name> [description]", "warning");
            return;
          }

          const name = orchestrationRest[0];
          const description = orchestrationRest.slice(1).join(" ").trim() || undefined;

          try {
            const filePath = await scaffoldOrchestrationConfig(name, description);
            ctx.ui.notify(`Created orchestration scaffold: ${filePath}`, "info");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(`Failed to scaffold orchestration config: ${message}`, "error");
          }

          return;
        }

        ctx.ui.notify("Usage: /subagents orchestration <list|show|paths|scaffold>", "warning");
        return;
      }

      if (command === "paths") {
        const subagentDiscovery = discoverSubagents(ctx.cwd, "both");
        const orchestrationDiscovery = discoverOrchestrations(ctx.cwd, "both");
        const lines = [
          "Subagent search paths:",
          ...subagentDiscovery.userDirs.map((dir) => `- user: ${dir}`),
          ...subagentDiscovery.projectDirs.map((dir) => `- project: ${dir}`),
          `project root: ${subagentDiscovery.projectRoot ?? "(none)"}`,
          "",
          "Orchestration config search paths:",
          ...orchestrationDiscovery.userDirs.map((dir) => `- user: ${dir}`),
          ...orchestrationDiscovery.projectDirs.map((dir) => `- project: ${dir}`),
          `project root: ${orchestrationDiscovery.projectRoot ?? "(none)"}`,
        ];
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (command === "list") {
        const scope = parseScope(rest[0]) ?? "both";
        const discovery = discoverSubagents(ctx.cwd, scope);

        if (discovery.subagents.length === 0) {
          ctx.ui.notify(`No subagents found for scope \"${scope}\".`, "warning");
          return;
        }

        const lines = discovery.subagents.map((item) => {
          const providerModel = item.model
            ? ` model:${item.provider ? `${item.provider}/` : ""}${item.model}`
            : "";
          const tools = item.tools?.length ? ` tools:${item.tools.join(",")}` : "";
          return `- ${item.name} (${item.source}) — ${item.description}${providerModel}${tools}`;
        });

        ctx.ui.notify(`Subagents (${scope}):\n${lines.join("\n")}`, "info");
        return;
      }

      if (command === "show") {
        if (!rest[0]) {
          ctx.ui.notify("Usage: /subagents show <name> [scope]", "warning");
          return;
        }

        const targetName = rest[0].toLowerCase();
        const scope = parseScope(rest[1]) ?? "both";
        const discovery = discoverSubagents(ctx.cwd, scope);
        const found = discovery.subagents.find((item) => item.name.toLowerCase() === targetName);

        if (!found) {
          ctx.ui.notify(`Subagent not found: ${rest[0]} (scope: ${scope})`, "warning");
          return;
        }

        const lines = [
          `${found.name} (${found.source})`,
          found.description,
          `path: ${found.filePath}`,
          `provider: ${found.provider ?? "(default)"}`,
          `model: ${found.model ?? "(default)"}`,
          `tools: ${found.tools?.join(", ") ?? "(default)"}`,
          found.tags?.length ? `tags: ${found.tags.join(", ")}` : "",
        ].filter(Boolean);

        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (command === "scaffold") {
        if (!rest[0]) {
          ctx.ui.notify("Usage: /subagents scaffold <name> [description]", "warning");
          return;
        }

        const name = rest[0];
        const description = rest.slice(1).join(" ").trim() || undefined;

        try {
          const filePath = await scaffoldSubagent(name, description);
          ctx.ui.notify(`Created subagent scaffold: ${filePath}`, "info");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Failed to scaffold subagent: ${message}`, "error");
        }

        return;
      }

      ctx.ui.notify(usageCommandText(), "warning");
    },
  });

  pi.registerCommand("teams", {
    description: "Inspect, run, and create team orchestration workflows",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => getTeamsCommandCompletions(prefix),
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const usage = [
        "Usage:",
        "  /teams list",
        "  /teams show <team-id|name>",
        "  /teams cancel <team-id|name>",
        "  /teams cleanup <team-id|name|all>",
        "  /teams do <objective>",
        "  /teams create <reusable-team-description>",
      ].join("\n");

      const rawInput = (args ?? "").trim();
      const tokens = rawInput.split(/\s+/).filter(Boolean);
      const commandToken = (tokens[0] ?? "list").toLowerCase();
      const knownCommands = new Set(["help", "list", "show", "cancel", "cleanup", "do", "create"]);
      const implicitDo = Boolean(rawInput) && !knownCommands.has(commandToken);
      const command = implicitDo ? "do" : commandToken;

      const queuePlannerMessage = (text: string, infoMessage: string) => {
        if (ctx.isIdle()) {
          pi.sendUserMessage(text);
        } else {
          pi.sendUserMessage(text, { deliverAs: "followUp" });
        }
        ctx.ui.notify(infoMessage, "info");
      };

      const stripWrappingQuotes = (value: string): string => {
        const trimmed = value.trim();
        if (trimmed.length < 2) return trimmed;
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).trim();
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).trim();
        return trimmed;
      };

      if (command === "help") {
        ctx.ui.notify(usage, "info");
        return;
      }

      if (command === "do") {
        const objective = stripWrappingQuotes(implicitDo ? rawInput : tokens.slice(1).join(" ").trim());
        if (!objective) {
          ctx.ui.notify("Usage: /teams do <objective>", "warning");
          return;
        }

        const request = [
          "You are coordinating this objective using teams mode.",
          "",
          "Objective:",
          objective,
          "",
          "Execution requirements:",
          "1) Prefer reusing existing subagents and orchestration configs when viable.",
          "2) If needed, create or update reusable definitions in:",
          "   - pi/agent/subagents/*.md",
          "   - pi/agent/subagents/orchestrations/*.json",
          "3) Launch one or more teams via the `subagent` tool `teams` mode.",
          "4) Keep team naming clear and relation context explicit.",
          "5) Treat `/teams` command as the control surface for status/cancel/cleanup.",
          "6) Keep diffs focused and update relevant docs when adding reusable artifacts.",
          "",
          "Start by producing a brief execution plan, then execute.",
        ].join("\n");

        queuePlannerMessage(request, implicitDo ? "Queued team execution from natural-language objective." : "Queued team execution objective.");
        return;
      }

      if (command === "create") {
        const description = stripWrappingQuotes(tokens.slice(1).join(" ").trim());
        if (!description) {
          ctx.ui.notify("Usage: /teams create <reusable-team-description>", "warning");
          return;
        }

        const request = [
          "Design and create a reusable team capability for this description:",
          description,
          "",
          "Requirements:",
          "1) Create or update any missing reusable subagents in pi/agent/subagents/*.md.",
          "2) Create at least one reusable orchestration config in pi/agent/subagents/orchestrations/*.json.",
          "3) Ensure the resulting setup is callable in future sessions (document invocation examples).",
          "4) Update relevant docs (subagents/orchestrations README and pi/README where appropriate).",
          "5) Keep naming consistent and avoid unnecessary refactors.",
          "",
          "After creating artifacts, summarize exact invocation patterns (including a /subagents team example).",
        ].join("\n");

        queuePlannerMessage(request, "Queued reusable team creation request.");
        return;
      }

      if (command === "list") {
        const records = Array.from(teamRecords.values()).sort((a, b) => b.updatedAt - a.updatedAt);
        if (records.length === 0) {
          ctx.ui.notify("No teams have been launched in this session.", "info");
          return;
        }

        const statusIcon = (status: TeamStatus) => {
          if (status === "succeeded") return "✓";
          if (status === "failed") return "✗";
          if (status === "cancelled") return "◐";
          if (status === "skipped") return "⏭";
          if (status === "provisioning" || status === "running") return "⏳";
          return "○";
        };

        const lines = records.map((record) => {
          const stages = record.stages ?? [];
          const active =
            record.status === "running" && stages.length > 0
              ? ` stage:${Math.min((record.currentStage ?? 0) + 1, stages.length)}/${stages.length}`
              : "";
          return `${statusIcon(record.status)} ${record.id} · ${record.name} · ${record.orchestrationConfig} · ${record.status}${active}`;
        });

        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (command === "show") {
        const target = tokens.slice(1).join(" ").trim();
        if (!target) {
          ctx.ui.notify("Usage: /teams show <team-id|name>", "warning");
          return;
        }

        const record = findTeamRecord(target);
        if (!record) {
          ctx.ui.notify(`Team not found: ${target}`, "warning");
          return;
        }

        const lines = [
          `${record.name} (${record.id})`,
          `status: ${record.status}`,
          `workflow: ${record.workflowId}`,
          `orchestration: ${record.orchestrationConfig} (${record.configSource})`,
          `config path: ${record.configFilePath}`,
          `task: ${record.task}`,
          record.relation ? `relation: ${record.relation}` : "",
          record.worktreePath ? `worktree: ${record.worktreePath}` : "worktree: (none)",
          record.worktreeBranch ? `branch: ${record.worktreeBranch}` : "",
          record.worktreeBaseRef ? `base ref: ${record.worktreeBaseRef}` : "",
          record.error ? `error: ${record.error}` : "",
          `subagent runs: ${record.results.length}`,
        ].filter(Boolean);

        if (record.stages?.length) {
          lines.push("stages:");
          for (const stage of record.stages) {
            lines.push(
              `  ${stage.index + 1}. ${stage.label} (${stage.done}/${stage.total} done, ${stage.running} running, ${stage.failed} failed)`
            );
          }
        }

        if (record.results.length > 0) {
          lines.push("recent outputs:");
          const bySubagent = record.results.slice(-4);
          for (const result of bySubagent) {
            const output = getFinalOutput(result.messages).trim();
            const preview = output ? output.split("\n")[0] : "(no output)";
            const status = isFailed(result) ? "failed" : result.exitCode === -1 ? "running" : "ok";
            lines.push(`  - ${result.subagent} [${status}] ${preview}`);
          }
        }

        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (command === "cancel") {
        const target = tokens.slice(1).join(" ").trim();
        if (!target) {
          ctx.ui.notify("Usage: /teams cancel <team-id|name>", "warning");
          return;
        }

        const record = findTeamRecord(target);
        if (!record) {
          ctx.ui.notify(`Team not found: ${target}`, "warning");
          return;
        }

        const controller = activeTeamControllers.get(record.id);
        if (!controller) {
          ctx.ui.notify(`Team is not currently running: ${record.id}`, "warning");
          return;
        }

        controller.abort();
        ctx.ui.notify(`Cancellation requested for team ${record.id}`, "info");
        return;
      }

      if (command === "cleanup") {
        const target = tokens.slice(1).join(" ").trim();
        if (!target) {
          ctx.ui.notify("Usage: /teams cleanup <team-id|name|all>", "warning");
          return;
        }

        const candidates =
          target.toLowerCase() === "all"
            ? Array.from(teamRecords.values())
            : [findTeamRecord(target)].filter((item): item is TeamRecord => Boolean(item));

        if (candidates.length === 0) {
          ctx.ui.notify(`No team records matched: ${target}`, "warning");
          return;
        }

        const cleanupTargets = candidates.filter(
          (item) =>
            item.worktreePath &&
            item.repoRoot &&
            item.status !== "running" &&
            item.status !== "provisioning" &&
            !activeTeamControllers.has(item.id)
        );

        if (cleanupTargets.length === 0) {
          ctx.ui.notify("No completed teams with removable worktrees were found.", "warning");
          return;
        }

        const confirmed = await ctx.ui.confirm(
          "Remove team worktrees?",
          cleanupTargets.map((item) => `- ${item.id}: ${item.worktreePath}`).join("\n")
        );

        if (!confirmed) {
          ctx.ui.notify("Cleanup cancelled.", "info");
          return;
        }

        let removed = 0;
        const failures: string[] = [];

        for (const item of cleanupTargets) {
          try {
            await removeTeamWorktree({
              repoRoot: item.repoRoot!,
              worktreePath: item.worktreePath!,
            });
            item.worktreePath = undefined;
            item.worktreeBranch = undefined;
            item.worktreeBaseRef = undefined;
            upsertTeamRecord(item);
            removed += 1;
          } catch (error) {
            failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        const lines = [`Removed ${removed}/${cleanupTargets.length} worktrees.`];
        if (failures.length > 0) {
          lines.push("Failures:");
          lines.push(...failures.map((item) => `- ${item}`));
        }

        ctx.ui.notify(lines.join("\n"), failures.length > 0 ? "warning" : "info");
        return;
      }

      ctx.ui.notify(usage, "warning");
    },
  });

  pi.registerTool({
    name: "subagent_list",
    label: "Subagent List",
    description:
      "List available subagents and their capabilities. Use this before subagent invocation or orchestration.",
    parameters: SubagentListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const scope: SubagentScope = params.scope ?? "user";
      const discovery = discoverSubagents(ctx.cwd, scope);
      const includePrompt = params.includePrompt ?? false;

      const summary =
        discovery.subagents.length === 0
          ? `No subagents found in scope \"${scope}\".`
          : discovery.subagents
              .map((item) => {
                const providerModel = item.model
                  ? ` model:${item.provider ? `${item.provider}/` : ""}${item.model}`
                  : "";
                const tools = item.tools?.length ? ` tools:${item.tools.join(",")}` : "";
                return `- ${item.name} (${item.source}) — ${item.description}${providerModel}${tools}`;
              })
              .join("\n");

      return {
        content: [{ type: "text", text: summary }],
        details: {
          scope,
          projectRoot: discovery.projectRoot,
          diagnostics: discovery.diagnostics,
          subagents: discovery.subagents.map((item) => ({
            name: item.name,
            source: item.source,
            description: item.description,
            provider: item.provider,
            model: item.model,
            tools: item.tools,
            tags: item.tags,
            filePath: item.filePath,
            systemPrompt: includePrompt ? item.systemPrompt : undefined,
          })),
        },
      };
    },
    renderCall(args, theme) {
      const scope = args.scope ?? "user";
      return new Text(
        theme.fg("toolTitle", theme.bold("subagent_list ")) + theme.fg("accent", `[${scope}]`),
        0,
        0
      );
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as
        | {
            subagents?: Array<{
              name: string;
              source: "user" | "project";
              description: string;
              provider?: string;
              model?: string;
              tools?: string[];
              filePath: string;
            }>;
          }
        | undefined;

      if (!details?.subagents?.length) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
      }

      const max = expanded ? details.subagents.length : 8;
      let text = theme.fg("success", `Found ${details.subagents.length} subagents`);

      for (const item of details.subagents.slice(0, max)) {
        const providerModel = item.model
          ? ` model:${item.provider ? `${item.provider}/` : ""}${item.model}`
          : "";
        const tools = item.tools?.length ? ` tools:${item.tools.join(",")}` : "";
        text +=
          "\n" +
          theme.fg("accent", `• ${item.name}`) +
          theme.fg("muted", ` (${item.source})`) +
          theme.fg("dim", ` ${item.description}${providerModel}${tools}`);
      }

      if (!expanded && details.subagents.length > max) {
        text += "\n" + theme.fg("muted", `... +${details.subagents.length - max} more (${getExpandHint()})`);
      }

      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Delegate work to specialized subagents loaded from ~/.pi/agent/subagents (default).",
      "Supports single, parallel, chain, staged orchestration, and multi-team orchestration modes.",
      "Orchestration can be inline or loaded from named JSON configs in ~/.pi/agent/subagents/orchestrations.",
      "Teams mode runs multiple orchestration configs in parallel; each team is provisioned in its own git worktree.",
      "Use subagent_list first when you need to discover available subagents.",
      "Set relation to explain how delegated work maps to the parent session objective.",
    ].join(" "),
    parameters: SubagentInvokeParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const workflowId = createWorkflowId();

      const inlineOrchestrationStages: RuntimeOrchestrationStage[] | undefined = params.orchestration?.map(
        (stage) => ({
          label: stage.label?.trim() || undefined,
          relation: stage.relation?.trim() || undefined,
          concurrency: stage.concurrency,
          tasks: stage.tasks.map((task) => ({
            subagent: task.subagent,
            task: task.task,
            relation: task.relation?.trim() || undefined,
            cwd: task.cwd?.trim() || undefined,
          })),
        })
      );

      const hasInlineOrchestration = Boolean(inlineOrchestrationStages?.length);
      const hasNamedOrchestration = Boolean(params.orchestrationConfig?.trim());
      const hasTeams = Boolean(params.teams?.length);

      if (hasInlineOrchestration && hasNamedOrchestration) {
        return {
          content: [
            {
              type: "text",
              text: "Provide either orchestration or orchestrationConfig, not both.",
            },
          ],
          details: {
            mode: "orchestration",
            scope: params.scope ?? "user",
            workflowId,
            relation: params.relation,
            projectRoot: null,
            results: [],
          },
          isError: true,
        };
      }

      let orchestrationConfig: OrchestrationConfigDefinition | undefined;
      let orchestrationStages: RuntimeOrchestrationStage[] | undefined = inlineOrchestrationStages;

      if (!hasTeams && hasNamedOrchestration && params.orchestrationConfig) {
        const configScope: SubagentScope = params.orchestrationConfigScope ?? "both";
        const resolved = resolveOrchestrationConfigByName(ctx.cwd, configScope, params.orchestrationConfig);

        if (!resolved.config) {
          const diagnostics =
            resolved.diagnostics.length > 0
              ? `\nDiagnostics:\n${resolved.diagnostics.map((item) => `- ${item}`).join("\n")}`
              : "";
          return {
            content: [{ type: "text", text: `${resolved.error || "Failed to resolve orchestration config."}${diagnostics}` }],
            details: {
              mode: "orchestration",
              scope: params.scope ?? "user",
              workflowId,
              relation: params.relation,
              projectRoot: resolved.projectRoot,
              results: [],
            },
            isError: true,
          };
        }

        orchestrationConfig = resolved.config;
        orchestrationStages = normalizeOrchestrationStages(resolved.config.stages);
      }

      const resolvedTeams: ResolvedTeamInvocation[] = [];

      if (hasTeams && params.teams) {
        for (const [index, item] of params.teams.entries()) {
          const teamName = item.name.trim();
          if (!teamName) {
            return {
              content: [{ type: "text", text: `Team at index ${index} is missing a non-empty name.` }],
              details: {
                mode: "teams",
                scope: params.scope ?? "user",
                workflowId,
                relation: params.relation,
                projectRoot: null,
                results: [],
              },
              isError: true,
            };
          }

          const configScope: SubagentScope = item.orchestrationConfigScope ?? params.orchestrationConfigScope ?? "both";
          const resolved = resolveOrchestrationConfigByName(ctx.cwd, configScope, item.orchestrationConfig);

          if (!resolved.config) {
            const diagnostics =
              resolved.diagnostics.length > 0
                ? `\nDiagnostics:\n${resolved.diagnostics.map((entry) => `- ${entry}`).join("\n")}`
                : "";
            return {
              content: [
                {
                  type: "text",
                  text: `Team \"${teamName}\" orchestration lookup failed: ${resolved.error || "unknown error"}${diagnostics}`,
                },
              ],
              details: {
                mode: "teams",
                scope: params.scope ?? "user",
                workflowId,
                relation: params.relation,
                projectRoot: resolved.projectRoot,
                results: [],
              },
              isError: true,
            };
          }

          resolvedTeams.push({
            id: `${workflowId}-team-${index + 1}`,
            name: teamName,
            task: item.task,
            relation: item.relation,
            baseRef: item.baseRef,
            worktreeParent: item.worktreeParent,
            config: resolved.config,
            stages: normalizeOrchestrationStages(resolved.config.stages),
          });
        }
      }

      const mergeScopes = (items: Array<SubagentScope | undefined>): SubagentScope => {
        const values = new Set(items.filter((item): item is SubagentScope => Boolean(item)));
        if (values.has("both")) return "both";
        if (values.has("user") && values.has("project")) return "both";
        if (values.has("project")) return "project";
        if (values.has("user")) return "user";
        return "user";
      };

      const inferredScope = mergeScopes([
        orchestrationConfig?.scope,
        ...resolvedTeams.map((team) => team.config.scope),
      ]);

      const scope: SubagentScope = params.scope ?? inferredScope;
      const inferredConfirmProjectSubagents = hasTeams
        ? resolvedTeams.some((team) => team.config.confirmProjectSubagents ?? true)
        : orchestrationConfig?.confirmProjectSubagents ?? true;
      const confirmProjectSubagents = params.confirmProjectSubagents ?? inferredConfirmProjectSubagents;
      const relation = params.relation ?? orchestrationConfig?.relation;

      const discovery = discoverSubagents(ctx.cwd, scope);
      const subagents = discovery.subagents;

      const hasSingle = Boolean(params.subagent && params.task);
      const hasParallel = Boolean(params.tasks?.length);
      const hasChain = Boolean(params.chain?.length);
      const hasOrchestration = Boolean(orchestrationStages?.length);
      const hasOrchestrationInput = hasInlineOrchestration || hasNamedOrchestration || hasOrchestration;
      const modeCount =
        Number(hasSingle) + Number(hasParallel) + Number(hasChain) + Number(hasOrchestrationInput) + Number(hasTeams);

      const mode: ExecutionMode = hasTeams
        ? "teams"
        : hasOrchestrationInput
          ? "orchestration"
          : hasChain
            ? "chain"
            : hasParallel
              ? "parallel"
              : "single";

      const makeDetails = (
        detailMode: ExecutionMode,
        results: SubagentRunResult[],
        options?: {
          stages?: OrchestrationStageSummary[];
          currentStage?: number;
          teams?: TeamSummary[];
          teamsFailureMode?: TeamFailureMode;
          teamsConcurrency?: number;
        }
      ): SubagentToolDetails => ({
        mode: detailMode,
        scope,
        workflowId,
        relation,
        projectRoot: discovery.projectRoot,
        results,
        stages: options?.stages,
        currentStage: options?.currentStage,
        teams: options?.teams,
        teamsFailureMode: options?.teamsFailureMode,
        teamsConcurrency: options?.teamsConcurrency,
        orchestrationConfig: orchestrationConfig
          ? {
              name: orchestrationConfig.name,
              source: orchestrationConfig.source,
              filePath: orchestrationConfig.filePath,
            }
          : undefined,
      });

      if (modeCount !== 1) {
        return {
          content: [
            {
              type: "text",
              text: "Provide exactly one mode: single, tasks, chain, orchestration, orchestrationConfig, or teams.",
            },
          ],
          details: makeDetails(mode, []),
          isError: true,
        };
      }

      if (subagents.length === 0) {
        return {
          content: [{ type: "text", text: `No subagents available in scope \"${scope}\".` }],
          details: makeDetails(mode, []),
          isError: true,
        };
      }

      if ((scope === "project" || scope === "both") && confirmProjectSubagents && ctx.hasUI) {
        const requested = new Set<string>();
        if (hasSingle && params.subagent) requested.add(params.subagent);
        if (params.tasks) for (const item of params.tasks) requested.add(item.subagent);
        if (params.chain) for (const item of params.chain) requested.add(item.subagent);
        if (orchestrationStages) {
          for (const stage of orchestrationStages) {
            for (const item of stage.tasks) requested.add(item.subagent);
          }
        }
        if (resolvedTeams.length > 0) {
          for (const team of resolvedTeams) {
            for (const stage of team.stages) {
              for (const item of stage.tasks) requested.add(item.subagent);
            }
          }
        }

        const projectSubagents = Array.from(requested)
          .map((name) => subagents.find((item) => item.name === name))
          .filter((item): item is SubagentDefinition => item?.source === "project");

        if (projectSubagents.length > 0) {
          const names = projectSubagents.map((item) => item.name).join(", ");
          const confirmed = await ctx.ui.confirm(
            "Use project-local subagents?",
            `Requested: ${names}\nProject root: ${discovery.projectRoot ?? "(unknown)"}\n\nOnly allow this in trusted repositories.`
          );

          if (!confirmed) {
            return {
              content: [{ type: "text", text: "Cancelled: project-local subagents were not approved." }],
              details: makeDetails(mode, []),
              isError: true,
            };
          }
        }
      }

      try {
        const parentModel = getParentModelInfo(ctx);

        if (hasSingle && params.subagent && params.task) {
          const title = `${params.subagent} (single)`;
          const running = [makeUnknownResult(params.subagent, params.task, relation)];
          running[0].exitCode = -1;
          updateWorkflow(ctx, workflowId, title, toWorkflowLines(makeDetails("single", running)));

          const result = await runSingleSubagent(
            ctx.cwd,
            subagents,
            {
              subagent: params.subagent,
              task: params.task,
              relation,
              cwd: params.cwd,
            },
            signal,
            (partial) => {
              const details = makeDetails("single", [partial]);
              updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));
              onUpdate?.({
                content: [{ type: "text", text: getFinalOutput(partial.messages) || "(running...)" }],
                details,
              });
            },
            parentModel
          );

          const details = makeDetails("single", [result]);
          updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));

          if (isFailed(result)) {
            const error = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
            return {
              content: [{ type: "text", text: `Subagent failed (${result.subagent}): ${error}` }],
              details,
              isError: true,
            };
          }

          return {
            content: [{ type: "text", text: getFinalOutput(result.messages) || "(no output)" }],
            details,
          };
        }

        if (hasParallel && params.tasks) {
          if (params.tasks.length > MAX_PARALLEL_TASKS) {
            return {
              content: [
                {
                  type: "text",
                  text: `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`,
                },
              ],
              details: makeDetails("parallel", []),
              isError: true,
            };
          }

          const title = `parallel (${params.tasks.length})`;
          const running: SubagentRunResult[] = params.tasks.map((item) => ({
            subagent: item.subagent,
            source: "unknown",
            task: item.task,
            relation: item.relation ?? relation,
            exitCode: -1,
            messages: [],
            stderr: "",
            usage: makeUsage(),
          }));

          updateWorkflow(ctx, workflowId, title, toWorkflowLines(makeDetails("parallel", running)));

          const results = await mapWithConcurrencyLimit(params.tasks, MAX_CONCURRENCY, async (item, index) => {
            const result = await runSingleSubagent(
              ctx.cwd,
              subagents,
              {
                subagent: item.subagent,
                task: item.task,
                relation: item.relation ?? relation,
                cwd: item.cwd,
              },
              signal,
              (partial) => {
                running[index] = partial;
                const details = makeDetails("parallel", [...running]);
                updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));
                onUpdate?.({
                  content: [
                    {
                      type: "text",
                      text: `Parallel ${running.filter((r) => r.exitCode !== -1).length}/${running.length} complete`,
                    },
                  ],
                  details,
                });
              },
              parentModel
            );

            running[index] = result;
            const details = makeDetails("parallel", [...running]);
            updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));
            onUpdate?.({
              content: [
                {
                  type: "text",
                  text: `Parallel ${running.filter((r) => r.exitCode !== -1).length}/${running.length} complete`,
                },
              ],
              details,
            });
            return result;
          });

          const details = makeDetails("parallel", results);
          const successCount = results.filter((item) => !isFailed(item)).length;
          const isError = successCount !== results.length;

          return {
            content: [
              {
                type: "text",
                text: `Parallel complete: ${successCount}/${results.length} succeeded\n\n${summarizeResults(results)}`,
              },
            ],
            details,
            isError,
          };
        }

        if (hasOrchestration && orchestrationStages) {
          if (orchestrationStages.length > MAX_ORCHESTRATION_STAGES) {
            return {
              content: [
                {
                  type: "text",
                  text: `Too many orchestration stages (${orchestrationStages.length}). Max is ${MAX_ORCHESTRATION_STAGES}.`,
                },
              ],
              details: makeDetails("orchestration", []),
              isError: true,
            };
          }

          const title = `orchestration (${orchestrationStages.length} stages)`;
          const pushOrchestrationProgress = (message: string, snapshot: OrchestrationExecutionSnapshot) => {
            const details = makeDetails("orchestration", snapshot.results, {
              stages: snapshot.stages,
              currentStage: snapshot.currentStage,
            });
            updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));
            onUpdate?.({
              content: [{ type: "text", text: message }],
              details,
            });
          };

          updateWorkflow(ctx, workflowId, title, toWorkflowLines(makeDetails("orchestration", [])));

          const orchestrationRun = await executeOrchestrationRun({
            baseCwd: ctx.cwd,
            subagents,
            orchestrationStages,
            relation,
            orchestrationConfig,
            signal,
            parentModel,
            onProgress: pushOrchestrationProgress,
          });

          const details = makeDetails("orchestration", orchestrationRun.snapshot.results, {
            stages: orchestrationRun.snapshot.stages,
            currentStage: orchestrationRun.snapshot.currentStage,
          });
          updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));

          if (!orchestrationRun.ok) {
            const orchestrationError = "error" in orchestrationRun ? orchestrationRun.error : "Unknown orchestration failure";
            return {
              content: [
                {
                  type: "text",
                  text: `Orchestration stopped: ${orchestrationError}`,
                },
              ],
              details,
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text",
                text: orchestrationRun.finalOutputs.length
                  ? orchestrationRun.finalOutputs.join("\n\n---\n\n")
                  : `Orchestration complete (${orchestrationStages.length} stages).`,
              },
            ],
            details,
          };
        }

        if (hasTeams && resolvedTeams.length > 0) {
          if (resolvedTeams.length > MAX_TEAMS) {
            return {
              content: [
                {
                  type: "text",
                  text: `Too many teams (${resolvedTeams.length}). Max is ${MAX_TEAMS}.`,
                },
              ],
              details: makeDetails("teams", []),
              isError: true,
            };
          }

          const teamsFailureMode: TeamFailureMode = params.teamsFailureMode ?? "continue";
          const teamsConcurrency = Math.max(
            1,
            Math.min(params.teamsConcurrency ?? Math.min(2, resolvedTeams.length), MAX_TEAM_CONCURRENCY)
          );

          const title = `teams (${resolvedTeams.length})`;
          const teamStates: TeamRecord[] = resolvedTeams.map((team) => ({
            id: team.id,
            name: team.name,
            orchestrationConfig: team.config.name,
            status: "queued",
            task: team.task,
            relation: team.relation ?? relation,
            workflowId,
            configSource: team.config.source,
            configFilePath: team.config.filePath,
            results: [],
            updatedAt: Date.now(),
          }));

          for (const record of teamStates) {
            upsertTeamRecord(record);
          }

          const summarizeTeams = () => teamStates.map((team) => summarizeTeam(team));
          const buildTeamDetails = () =>
            makeDetails(
              "teams",
              teamStates.flatMap((team) => team.results),
              {
                teams: summarizeTeams(),
                teamsFailureMode,
                teamsConcurrency,
              }
            );

          const publish = (message: string) => {
            const details = buildTeamDetails();
            updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));
            onUpdate?.({
              content: [{ type: "text", text: message }],
              details,
            });
          };

          publish(`Teams queued (${resolvedTeams.length}).`);

          let nextTeamIndex = 0;
          let stopScheduling = false;

          const runTeam = async (teamIndex: number, controller: AbortController): Promise<void> => {
            const teamInput = resolvedTeams[teamIndex];
            const state = teamStates[teamIndex];

            if (!state || !teamInput) return;

            try {
              state.status = "provisioning";
              if (!state.startedAt) state.startedAt = Date.now();
              upsertTeamRecord(state);
              publish(`Team ${state.name}: provisioning worktree`);

              const worktree = await provisionTeamWorktree({
                cwd: ctx.cwd,
                teamName: state.name,
                teamId: state.id,
                baseRef: teamInput.baseRef,
                worktreeParent: teamInput.worktreeParent,
                signal: controller.signal,
              });

              state.repoRoot = worktree.repoRoot;
              state.worktreePath = worktree.worktreePath;
              state.worktreeBranch = worktree.branch;
              state.worktreeBaseRef = worktree.baseRef;
              state.status = "running";
              upsertTeamRecord(state);
              publish(`Team ${state.name}: running (${worktree.worktreePath})`);

              const teamRelation = buildTeamRelation(relation, teamInput);
              const orchestrationRun = await executeOrchestrationRun({
                baseCwd: worktree.worktreePath,
                subagents,
                orchestrationStages: teamInput.stages,
                relation: teamRelation,
                orchestrationConfig: teamInput.config,
                signal: controller.signal,
                parentModel,
                resolveTaskCwd: (taskCwd) => resolveTeamTaskCwd(worktree.worktreePath, taskCwd),
                onProgress: (message, snapshot) => {
                  state.stages = snapshot.stages;
                  state.currentStage = snapshot.currentStage;
                  state.results = snapshot.results.map((item) => ({ ...item, teamId: state.id }));
                  upsertTeamRecord(state);
                  publish(`Team ${state.name}: ${message}`);
                },
              });

              state.stages = orchestrationRun.snapshot.stages;
              state.currentStage = orchestrationRun.snapshot.currentStage;
              state.results = orchestrationRun.snapshot.results.map((item) => ({ ...item, teamId: state.id }));

              if (orchestrationRun.ok) {
                state.status = "succeeded";
                state.error = undefined;
              } else {
                const orchestrationError =
                  "error" in orchestrationRun ? orchestrationRun.error : "Unknown orchestration failure";
                if (controller.signal.aborted) {
                  state.status = "cancelled";
                  state.error = orchestrationError;
                } else {
                  state.status = "failed";
                  state.error = orchestrationError;
                }
              }
            } catch (error) {
              if (controller.signal.aborted || signal?.aborted) {
                state.status = "cancelled";
              } else {
                state.status = "failed";
              }
              state.error = error instanceof Error ? error.message : String(error);
            } finally {
              state.endedAt = Date.now();
              upsertTeamRecord(state);
              publish(`Team ${state.name}: ${state.status}`);
            }
          };

          const worker = async () => {
            while (true) {
              if (stopScheduling) return;
              const teamIndex = nextTeamIndex;
              nextTeamIndex += 1;

              if (teamIndex >= teamStates.length) return;

              const state = teamStates[teamIndex];
              const controller = new AbortController();
              activeTeamControllers.set(state.id, controller);

              const onParentAbort = () => controller.abort();
              if (signal?.aborted) controller.abort();
              else signal?.addEventListener("abort", onParentAbort, { once: true });

              try {
                await runTeam(teamIndex, controller);
              } finally {
                if (signal) signal.removeEventListener("abort", onParentAbort);
                activeTeamControllers.delete(state.id);
              }

              if (state.status === "failed") {
                if (teamsFailureMode === "fail-fast") {
                  stopScheduling = true;
                }
                if (teamsFailureMode === "cancel-running") {
                  stopScheduling = true;
                  for (const [teamId, activeController] of activeTeamControllers.entries()) {
                    if (teamId === state.id) continue;
                    activeController.abort();
                  }
                }
              }

              if (signal?.aborted) {
                stopScheduling = true;
              }
            }
          };

          const workerCount = Math.max(1, Math.min(teamsConcurrency, teamStates.length));
          await Promise.all(new Array(workerCount).fill(null).map(() => worker()));

          const parentAborted = Boolean(signal?.aborted);
          if (stopScheduling || parentAborted) {
            for (const state of teamStates) {
              if (state.status !== "queued") continue;
              state.status = parentAborted ? "cancelled" : "skipped";
              if (!state.error && !parentAborted && teamsFailureMode !== "continue") {
                state.error = `Skipped due to ${teamsFailureMode} policy`;
              }
              state.endedAt = Date.now();
              upsertTeamRecord(state);
            }
          }

          const details = buildTeamDetails();
          updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));

          const succeeded = teamStates.filter((team) => team.status === "succeeded").length;
          const failed = teamStates.filter((team) => team.status === "failed").length;
          const cancelled = teamStates.filter((team) => team.status === "cancelled").length;
          const skipped = teamStates.filter((team) => team.status === "skipped").length;
          const isError = failed > 0 || cancelled > 0 || parentAborted;

          const lines: string[] = [`Teams complete: ${succeeded}/${teamStates.length} succeeded`];
          if (failed > 0) lines.push(`${failed} failed`);
          if (cancelled > 0) lines.push(`${cancelled} cancelled`);
          if (skipped > 0) lines.push(`${skipped} skipped`);
          lines.push("");

          for (const team of teamStates) {
            const worktree = team.worktreePath ?? "(worktree not created)";
            lines.push(`- ${team.name} [${team.status}] ${worktree}`);
            if (team.error) lines.push(`  error: ${team.error}`);
            const preview = buildTeamPreview(team.results);
            if (preview) lines.push(`  output: ${preview}`);
          }

          return {
            content: [{ type: "text", text: lines.join("\n") }],
            details,
            isError,
          };
        }

        if (hasChain && params.chain) {
          const title = `chain (${params.chain.length})`;
          const results: SubagentRunResult[] = [];
          let previousOutput = "";

          updateWorkflow(ctx, workflowId, title, toWorkflowLines(makeDetails("chain", results)));

          for (let i = 0; i < params.chain.length; i++) {
            const item = params.chain[i];
            const task = item.task.replace(/\{previous\}/g, previousOutput);

            const result = await runSingleSubagent(
              ctx.cwd,
              subagents,
              {
                subagent: item.subagent,
                task,
                relation: item.relation ?? relation,
                cwd: item.cwd,
                step: i + 1,
              },
              signal,
              (partial) => {
                const partialResults = [...results, partial];
                const details = makeDetails("chain", partialResults);
                updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));
                onUpdate?.({
                  content: [{ type: "text", text: `Chain step ${i + 1}/${params.chain!.length} running...` }],
                  details,
                });
              },
              parentModel
            );

            results.push(result);
            const details = makeDetails("chain", [...results]);
            updateWorkflow(ctx, workflowId, title, toWorkflowLines(details));
            onUpdate?.({
              content: [{ type: "text", text: `Chain step ${i + 1}/${params.chain.length} complete` }],
              details,
            });

            if (isFailed(result)) {
              const error = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
              return {
                content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${item.subagent}): ${error}` }],
                details,
                isError: true,
              };
            }

            previousOutput = getFinalOutput(result.messages);
          }

          const details = makeDetails("chain", results);
          return {
            content: [{ type: "text", text: getFinalOutput(results[results.length - 1]?.messages ?? []) || "(no output)" }],
            details,
          };
        }

        return {
          content: [{ type: "text", text: "Invalid subagent invocation." }],
          details: makeDetails(mode, []),
          isError: true,
        };
      } finally {
        clearWorkflow(ctx, workflowId);
      }
    },

    renderCall(args, theme) {
      const scope = args.scope ?? (args.orchestrationConfig || args.teams?.length ? "auto" : "user");

      if (args.orchestrationConfig && !args.orchestration?.length) {
        let text =
          theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg("accent", `orchestration-config ${args.orchestrationConfig}`) +
          theme.fg("muted", ` [${scope}]`);

        if (args.orchestrationConfigScope) {
          text += `\n  ${theme.fg("muted", "config scope:")} ${theme.fg("dim", args.orchestrationConfigScope)}`;
        }

        return new Text(text, 0, 0);
      }

      if (args.orchestration?.length) {
        let text =
          theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg("accent", `orchestration (${args.orchestration.length} stages)`) +
          theme.fg("muted", ` [${scope}]`);

        for (const [index, stage] of args.orchestration.slice(0, 3).entries()) {
          const label = stage.label?.trim() || `stage-${index + 1}`;
          const taskCount = stage.tasks.length;
          text += `\n  ${theme.fg("muted", `${index + 1}.`)} ${theme.fg("accent", label)} ${theme.fg("dim", `${taskCount} task${taskCount === 1 ? "" : "s"}`)}`;
        }

        if (args.orchestration.length > 3) {
          text += `\n  ${theme.fg("muted", `... +${args.orchestration.length - 3} more`)}`;
        }

        return new Text(text, 0, 0);
      }

      if (Array.isArray(args.teams) && args.teams.length > 0) {
        const teams = args.teams as Array<{
          name: string;
          orchestrationConfig: string;
          task: string;
        }>;

        let text =
          theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg("accent", `teams (${teams.length})`) +
          theme.fg("muted", ` [${scope}]`);

        const concurrency = args.teamsConcurrency ?? 2;
        const failureMode = args.teamsFailureMode ?? "continue";
        text += `\n  ${theme.fg("muted", "concurrency:")} ${theme.fg("dim", `${concurrency}`)} ${theme.fg("muted", "failure:")} ${theme.fg("dim", failureMode)}`;

        for (const team of teams.slice(0, 3)) {
          const preview = team.task.length > 40 ? `${team.task.slice(0, 40)}...` : team.task;
          text += `\n  ${theme.fg("accent", team.name)} ${theme.fg("dim", `${team.orchestrationConfig} · ${preview}`)}`;
        }

        if (teams.length > 3) {
          text += `\n  ${theme.fg("muted", `... +${teams.length - 3} more`)}`;
        }

        return new Text(text, 0, 0);
      }

      if (args.chain?.length) {
        let text =
          theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg("accent", `chain (${args.chain.length})`) +
          theme.fg("muted", ` [${scope}]`);

        for (const [index, item] of args.chain.slice(0, 3).entries()) {
          const preview = item.task.length > 44 ? `${item.task.slice(0, 44)}...` : item.task;
          text += `\n  ${theme.fg("muted", `${index + 1}.`)} ${theme.fg("accent", item.subagent)} ${theme.fg("dim", preview)}`;
        }

        if (args.chain.length > 3) text += `\n  ${theme.fg("muted", `... +${args.chain.length - 3} more`)}`;
        return new Text(text, 0, 0);
      }

      if (args.tasks?.length) {
        let text =
          theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg("accent", `parallel (${args.tasks.length})`) +
          theme.fg("muted", ` [${scope}]`);

        for (const item of args.tasks.slice(0, 3)) {
          const preview = item.task.length > 44 ? `${item.task.slice(0, 44)}...` : item.task;
          text += `\n  ${theme.fg("accent", item.subagent)} ${theme.fg("dim", preview)}`;
        }

        if (args.tasks.length > 3) text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
        return new Text(text, 0, 0);
      }

      const subagent = args.subagent || "...";
      const task = args.task || "...";
      const preview = task.length > 64 ? `${task.slice(0, 64)}...` : task;
      let text =
        theme.fg("toolTitle", theme.bold("subagent ")) +
        theme.fg("accent", subagent) +
        theme.fg("muted", ` [${scope}]`) +
        `\n  ${theme.fg("dim", preview)}`;

      if (args.relation) {
        const relation = args.relation.length > 64 ? `${args.relation.slice(0, 64)}...` : args.relation;
        text += `\n  ${theme.fg("muted", "relation:")} ${theme.fg("dim", relation)}`;
      }

      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as SubagentToolDetails | undefined;
      const hasTeamDetails = details?.mode === "teams" && (details.teams?.length ?? 0) > 0;
      if (!details || (details.results.length === 0 && !hasTeamDetails)) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
      }

      const mdTheme = getMarkdownThemeSafe();

      const renderDisplayItems = (items: DisplayItem[], limit?: number): string => {
        const shown = limit ? items.slice(-limit) : items;
        const skipped = limit && items.length > limit ? items.length - limit : 0;
        let output = "";
        if (skipped > 0) output += `${theme.fg("muted", `... ${skipped} earlier items`)}\n`;

        for (const item of shown) {
          if (item.type === "text") {
            const text = expanded ? item.text : item.text.split("\n").slice(0, 3).join("\n");
            output += `${theme.fg("toolOutput", text)}\n`;
          } else {
            output += `${theme.fg("muted", "→ ")}${formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
          }
        }

        return output.trimEnd();
      };

      const aggregate = details.results.reduce(
        (acc, item) => ({
          input: acc.input + item.usage.input,
          output: acc.output + item.usage.output,
          cacheRead: acc.cacheRead + item.usage.cacheRead,
          cacheWrite: acc.cacheWrite + item.usage.cacheWrite,
          cost: acc.cost + item.usage.cost,
          turns: acc.turns + item.usage.turns,
          contextTokens: Math.max(acc.contextTokens, item.usage.contextTokens),
        }),
        { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0, contextTokens: 0 }
      );

      if (details.mode === "teams") {
        const teams = details.teams ?? [];
        const completed = teams.filter((team) =>
          ["succeeded", "failed", "cancelled", "skipped"].includes(team.status)
        ).length;
        const runningTeams = teams.filter((team) => team.status === "running" || team.status === "provisioning").length;
        const failedTeams = teams.filter((team) => team.status === "failed").length;

        const icon =
          runningTeams > 0
            ? theme.fg("warning", "⏳")
            : failedTeams > 0
              ? theme.fg("warning", "◐")
              : theme.fg("success", "✓");

        const header =
          `${icon} ${theme.fg("toolTitle", theme.bold("teams "))}` +
          theme.fg("accent", `${completed}/${teams.length} complete`);

        const statusIcon = (status: TeamStatus): string => {
          if (status === "succeeded") return theme.fg("success", "✓");
          if (status === "failed") return theme.fg("error", "✗");
          if (status === "cancelled") return theme.fg("warning", "◐");
          if (status === "skipped") return theme.fg("muted", "⏭");
          if (status === "provisioning" || status === "running") return theme.fg("warning", "⏳");
          return theme.fg("muted", "○");
        };

        if (!expanded) {
          let text = header;
          if (details.teamsConcurrency) {
            text += `\n${theme.fg("muted", "concurrency: ")}${theme.fg("dim", `${details.teamsConcurrency}`)}`;
          }
          if (details.teamsFailureMode) {
            text += `\n${theme.fg("muted", "failure mode: ")}${theme.fg("dim", details.teamsFailureMode)}`;
          }

          const max = 6;
          for (const team of teams.slice(0, max)) {
            const stages = team.stages ?? [];
            const activeStage =
              stages.length > 0
                ? stages[Math.max(0, Math.min(team.currentStage ?? 0, stages.length - 1))]
                : undefined;
            const stageStatus =
              activeStage && (team.status === "running" || team.status === "provisioning")
                ? ` stage ${activeStage.index + 1}: ${activeStage.done}/${activeStage.total}`
                : "";

            text += `\n${statusIcon(team.status)} ${theme.fg("accent", team.name)} ${theme.fg("dim", `${team.status}${stageStatus}`)}`;
          }

          if (teams.length > max) {
            text += `\n${theme.fg("muted", `... +${teams.length - max} more teams`)}`;
          }

          const usage = formatUsageStats(aggregate);
          if (usage) text += `\n\n${theme.fg("dim", `Total: ${usage}`)}`;
          text += `\n${theme.fg("muted", `(${getExpandHint()})`)}`;
          return new Text(text, 0, 0);
        }

        const container = new Container();
        container.addChild(new Text(header, 0, 0));

        if (details.teamsConcurrency || details.teamsFailureMode) {
          const parts: string[] = [];
          if (details.teamsConcurrency) parts.push(`concurrency:${details.teamsConcurrency}`);
          if (details.teamsFailureMode) parts.push(`failure:${details.teamsFailureMode}`);
          container.addChild(new Text(theme.fg("dim", parts.join("  ")), 0, 0));
        }

        for (const team of teams) {
          container.addChild(new Spacer(1));
          container.addChild(
            new Text(
              `${statusIcon(team.status)} ${theme.fg("accent", team.name)} ${theme.fg("muted", `(${team.id})`)}`,
              0,
              0
            )
          );
          container.addChild(new Text(theme.fg("muted", "config: ") + theme.fg("dim", team.orchestrationConfig), 0, 0));
          if (team.worktreePath) {
            container.addChild(new Text(theme.fg("muted", "worktree: ") + theme.fg("dim", team.worktreePath), 0, 0));
          }
          if (team.worktreeBranch) {
            container.addChild(new Text(theme.fg("muted", "branch: ") + theme.fg("dim", team.worktreeBranch), 0, 0));
          }

          if (team.stages?.length) {
            for (const stage of team.stages) {
              container.addChild(
                new Text(
                  `  ${theme.fg("muted", `${stage.index + 1}.`)} ${theme.fg("accent", stage.label)} ${theme.fg("dim", `${stage.done}/${stage.total} done, ${stage.running} running, ${stage.failed} failed`)}`,
                  0,
                  0
                )
              );
            }
          }

          if (team.preview) {
            container.addChild(new Text(theme.fg("toolOutput", `  ${team.preview}`), 0, 0));
          }

          if (team.error) {
            container.addChild(new Text(theme.fg("error", `  error: ${team.error}`), 0, 0));
          }
        }

        const usage = formatUsageStats(aggregate);
        if (usage) {
          container.addChild(new Spacer(1));
          container.addChild(new Text(theme.fg("dim", `Total: ${usage}`), 0, 0));
        }

        return container;
      }

      if (details.mode === "single") {
        const item = details.results[0];
        const status = isFailed(item) ? theme.fg("error", "✗") : theme.fg("success", "✓");
        const displayItems = getDisplayItems(item.messages);
        const finalOutput = getFinalOutput(item.messages).trim();

        if (!expanded) {
          let text =
            `${status} ${theme.fg("toolTitle", theme.bold(item.subagent))}` + theme.fg("muted", ` (${item.source})`);

          if (displayItems.length === 0) {
            text += `\n${theme.fg("muted", item.exitCode === -1 ? "(running...)" : "(no output)")}`;
          } else {
            text += `\n${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT)}`;
            if (displayItems.length > COLLAPSED_ITEM_COUNT) {
              text += `\n${theme.fg("muted", `(${getExpandHint()})`)}`;
            }
          }

          const usage = formatUsageStats(item.usage, modelLabel(item.provider, item.model));
          if (usage) text += `\n${theme.fg("dim", usage)}`;
          return new Text(text, 0, 0);
        }

        const container = new Container();
        container.addChild(
          new Text(
            `${status} ${theme.fg("toolTitle", theme.bold(item.subagent))}${theme.fg("muted", ` (${item.source})`)}`,
            0,
            0
          )
        );

        if (item.relation) {
          container.addChild(new Text(theme.fg("muted", "Relation:"), 0, 0));
          container.addChild(new Text(theme.fg("dim", item.relation), 0, 0));
          container.addChild(new Spacer(1));
        }

        container.addChild(new Text(theme.fg("muted", "Task:"), 0, 0));
        container.addChild(new Text(theme.fg("dim", item.task), 0, 0));

        if (displayItems.length > 0) {
          container.addChild(new Spacer(1));
          container.addChild(new Text(theme.fg("muted", "Tool activity:"), 0, 0));
          for (const activity of displayItems) {
            if (activity.type === "toolCall") {
              container.addChild(
                new Text(
                  `${theme.fg("muted", "→ ")}${formatToolCall(activity.name, activity.args, theme.fg.bind(theme))}`,
                  0,
                  0
                )
              );
            }
          }
        }

        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("muted", "Final output:"), 0, 0));
        if (finalOutput) {
          if (mdTheme) {
            container.addChild(new Markdown(finalOutput, 0, 0, mdTheme));
          } else {
            container.addChild(new Text(finalOutput, 0, 0));
          }
        } else {
          container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
        }

        const usage = formatUsageStats(item.usage, modelLabel(item.provider, item.model));
        if (usage) {
          container.addChild(new Spacer(1));
          container.addChild(new Text(theme.fg("dim", usage), 0, 0));
        }

        return container;
      }

      if (details.mode === "orchestration") {
        const stages = details.stages ?? [];
        const currentStage = details.currentStage ?? -1;
        const completedStages = stages.filter((stage) => stage.total > 0 && stage.done >= stage.total).length;
        const runningStages = stages.filter((stage) => stage.running > 0).length;
        const failedStages = stages.filter((stage) => stage.failed > 0).length;

        const orchestrationIcon =
          runningStages > 0
            ? theme.fg("warning", "⏳")
            : failedStages > 0
              ? theme.fg("warning", "◐")
              : theme.fg("success", "✓");

        const header =
          `${orchestrationIcon} ${theme.fg("toolTitle", theme.bold("orchestration "))}` +
          theme.fg("accent", `${completedStages}/${stages.length} stages complete`);
        const configInfo = details.orchestrationConfig
          ? `${details.orchestrationConfig.name} (${details.orchestrationConfig.source})`
          : undefined;

        if (!expanded || runningStages > 0) {
          let text = header;
          if (configInfo) {
            text += `\n${theme.fg("muted", "config: ")}${theme.fg("dim", configInfo)}`;
          }
          const max = expanded ? stages.length : 6;

          for (const stage of stages.slice(0, max)) {
            const icon =
              stage.running > 0
                ? theme.fg("warning", "⏳")
                : stage.done === 0
                  ? theme.fg("muted", "○")
                  : stage.failed > 0
                    ? theme.fg("error", "✗")
                    : theme.fg("success", "✓");

            const status =
              stage.running > 0
                ? `${stage.done}/${stage.total} done, ${stage.running} running`
                : stage.done === 0
                  ? "pending"
                  : stage.failed > 0
                    ? `${stage.done}/${stage.total} done, ${stage.failed} failed`
                    : `${stage.done}/${stage.total} done`;

            const marker = stage.index === currentStage ? theme.fg("accent", "→ ") : "  ";
            text += `\n${marker}${icon} ${theme.fg("accent", stage.label)} ${theme.fg("dim", status)}`;
          }

          if (!expanded && stages.length > max) {
            text += `\n${theme.fg("muted", `... +${stages.length - max} more stages`)}`;
          }

          if (runningStages === 0) {
            const usage = formatUsageStats(aggregate);
            if (usage) text += `\n\n${theme.fg("dim", `Total: ${usage}`)}`;
          }

          text += `\n${theme.fg("muted", `(${getExpandHint()})`)}`;
          return new Text(text, 0, 0);
        }

        const container = new Container();
        container.addChild(new Text(header, 0, 0));
        if (configInfo) {
          container.addChild(new Text(theme.fg("muted", "config: ") + theme.fg("dim", configInfo), 0, 0));
        }

        const byStage = new Map<number, SubagentRunResult[]>();
        for (const item of details.results) {
          const key = item.step ?? 0;
          const list = byStage.get(key) ?? [];
          list.push(item);
          byStage.set(key, list);
        }

        for (const stage of stages) {
          const icon =
            stage.failed > 0
              ? theme.fg("error", "✗")
              : stage.done === 0
                ? theme.fg("muted", "○")
                : theme.fg("success", "✓");
          container.addChild(new Spacer(1));
          container.addChild(
            new Text(
              `${theme.fg("muted", `${stage.index + 1}.`)} ${theme.fg("accent", stage.label)} ${icon} ${theme.fg("dim", `${stage.done}/${stage.total}`)}`,
              0,
              0
            )
          );

          for (const item of byStage.get(stage.index + 1) ?? []) {
            const itemIcon = isFailed(item) ? theme.fg("error", "✗") : theme.fg("success", "✓");
            container.addChild(new Text(`  ${itemIcon} ${theme.fg("accent", item.subagent)}`, 0, 0));

            const finalOutput = getFinalOutput(item.messages).trim();
            if (finalOutput) {
              const preview = finalOutput.length > 220 ? `${finalOutput.slice(0, 220)}...` : finalOutput;
              container.addChild(new Text(`    ${theme.fg("toolOutput", preview)}`, 0, 0));
            }

            const usage = formatUsageStats(item.usage, modelLabel(item.provider, item.model));
            if (usage) container.addChild(new Text(`    ${theme.fg("dim", usage)}`, 0, 0));
          }
        }

        const usage = formatUsageStats(aggregate);
        if (usage) {
          container.addChild(new Spacer(1));
          container.addChild(new Text(theme.fg("dim", `Total: ${usage}`), 0, 0));
        }

        return container;
      }

      const completed = details.results.filter((item) => item.exitCode !== -1).length;
      const running = details.results.length - completed;
      const ok = details.results.filter((item) => !isFailed(item) && item.exitCode !== -1).length;
      const statusIcon =
        running > 0
          ? theme.fg("warning", "⏳")
          : ok === details.results.length
            ? theme.fg("success", "✓")
            : theme.fg("warning", "◐");

      let header = `${statusIcon} ${theme.fg("toolTitle", theme.bold(details.mode + " "))}`;
      header +=
        running > 0
          ? theme.fg("accent", `${completed}/${details.results.length} done, ${running} running`)
          : theme.fg("accent", `${ok}/${details.results.length} succeeded`);

      if (!expanded || running > 0) {
        let text = header;

        for (const item of details.results) {
          const icon =
            item.exitCode === -1
              ? theme.fg("warning", "⏳")
              : isFailed(item)
                ? theme.fg("error", "✗")
                : theme.fg("success", "✓");

          text += `\n\n${theme.fg("muted", "─── ")}${theme.fg("accent", item.subagent)} ${icon}`;

          const displayItems = getDisplayItems(item.messages);
          if (displayItems.length === 0) {
            text += `\n${theme.fg("muted", item.exitCode === -1 ? "(running...)" : "(no output)")}`;
          } else {
            text += `\n${renderDisplayItems(displayItems, 5)}`;
          }
        }

        if (running === 0) {
          const usage = formatUsageStats(aggregate);
          if (usage) text += `\n\n${theme.fg("dim", `Total: ${usage}`)}`;
        }

        text += `\n${theme.fg("muted", `(${getExpandHint()})`)}`;
        return new Text(text, 0, 0);
      }

      const container = new Container();
      container.addChild(new Text(header, 0, 0));

      for (const item of details.results) {
        const icon = isFailed(item) ? theme.fg("error", "✗") : theme.fg("success", "✓");
        const displayItems = getDisplayItems(item.messages);
        const finalOutput = getFinalOutput(item.messages).trim();

        container.addChild(new Spacer(1));
        container.addChild(new Text(`${theme.fg("accent", item.subagent)} ${icon}`, 0, 0));
        container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", item.task), 0, 0));

        for (const activity of displayItems) {
          if (activity.type === "toolCall") {
            container.addChild(
              new Text(
                `${theme.fg("muted", "→ ")}${formatToolCall(activity.name, activity.args, theme.fg.bind(theme))}`,
                0,
                0
              )
            );
          }
        }

        if (finalOutput) {
          container.addChild(new Spacer(1));
          if (mdTheme) {
            container.addChild(new Markdown(finalOutput, 0, 0, mdTheme));
          } else {
            container.addChild(new Text(finalOutput, 0, 0));
          }
        }

        const usage = formatUsageStats(item.usage, modelLabel(item.provider, item.model));
        if (usage) container.addChild(new Text(theme.fg("dim", usage), 0, 0));
      }

      const usage = formatUsageStats(aggregate);
      if (usage) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", `Total: ${usage}`), 0, 0));
      }

      return container;
    },
  });
}
