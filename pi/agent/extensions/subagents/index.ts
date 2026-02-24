import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Message } from "@mariozechner/pi-ai";
import { StringEnum } from "@mariozechner/pi-ai";
import { getMarkdownTheme, type ExtensionAPI, type ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import type { AutocompleteItem } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  discoverSubagents,
  getUserSubagentDir,
  type SubagentDefinition,
  type SubagentScope,
} from "./registry.js";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const COLLAPSED_ITEM_COUNT = 8;
const ACTIVE_WIDGET_KEY = "subagents-active";
const ACTIVE_STATUS_KEY = "subagents";

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
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  provider?: string;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
}

interface SubagentToolDetails {
  mode: "single" | "parallel" | "chain";
  scope: SubagentScope;
  workflowId: string;
  relation?: string;
  projectRoot: string | null;
  results: SubagentRunResult[];
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

  ctx.ui.setWidget(ACTIVE_WIDGET_KEY, lines);
  ctx.ui.setStatus(
    ACTIVE_STATUS_KEY,
    `${activeWorkflows.size} active workflow${activeWorkflows.size === 1 ? "" : "s"}`
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
  onUpdate?: PartialUpdateCallback
): Promise<SubagentRunResult> {
  const subagent = subagents.find((item) => item.name === args.subagent);

  if (!subagent) {
    return {
      ...makeUnknownResult(args.subagent, args.task, args.relation, args.step),
      stderr: `Unknown subagent: ${args.subagent}`,
    };
  }

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
    provider: subagent.provider,
    model: subagent.model,
  };

  const commandArgs: string[] = ["--mode", "json", "-p", "--no-session"];
  if (subagent.provider) commandArgs.push("--provider", subagent.provider);
  if (subagent.model) commandArgs.push("--model", subagent.model);
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

function usageCommandText(): string {
  return [
    "Usage:",
    "  /subagents list [user|project|both]",
    "  /subagents show <name> [user|project|both]",
    "  /subagents paths",
    "  /subagents scaffold <name> [description]",
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

const COMMAND_SUBCOMMANDS = ["list", "show", "paths", "scaffold", "help"];

export default function subagentsExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    activeWorkflows.clear();
    if (ctx.hasUI) {
      ctx.ui.setWidget(ACTIVE_WIDGET_KEY, undefined);
      ctx.ui.setStatus(ACTIVE_STATUS_KEY, undefined);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    activeWorkflows.clear();
    if (ctx.hasUI) {
      ctx.ui.setWidget(ACTIVE_WIDGET_KEY, undefined);
      ctx.ui.setStatus(ACTIVE_STATUS_KEY, undefined);
    }
  });

  pi.registerCommand("subagents", {
    description: "Manage subagent definitions",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const input = prefix.trimStart().toLowerCase();
      const items = COMMAND_SUBCOMMANDS.filter((item) => item.startsWith(input)).map((item) => ({
        value: item,
        label: item,
      }));
      return items.length > 0 ? items : null;
    },
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

      if (command === "paths") {
        const discovery = discoverSubagents(ctx.cwd, "both");
        const lines = [
          "Subagent search paths:",
          ...discovery.userDirs.map((dir) => `- user: ${dir}`),
          ...discovery.projectDirs.map((dir) => `- project: ${dir}`),
          `project root: ${discovery.projectRoot ?? "(none)"}`,
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
        text += "\n" + theme.fg("muted", `... +${details.subagents.length - max} more (Ctrl+O to expand)`);
      }

      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Delegate work to specialized subagents loaded from ~/.pi/agent/subagents (default).",
      "Supports single, parallel, and chain modes.",
      "Use subagent_list first when you need to discover available subagents.",
      "Set relation to explain how delegated work maps to the parent session objective.",
    ].join(" "),
    parameters: SubagentInvokeParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const scope: SubagentScope = params.scope ?? "user";
      const confirmProjectSubagents = params.confirmProjectSubagents ?? true;

      const discovery = discoverSubagents(ctx.cwd, scope);
      const subagents = discovery.subagents;
      const workflowId = createWorkflowId();

      const hasSingle = Boolean(params.subagent && params.task);
      const hasParallel = Boolean(params.tasks?.length);
      const hasChain = Boolean(params.chain?.length);
      const modeCount = Number(hasSingle) + Number(hasParallel) + Number(hasChain);

      const makeDetails = (
        mode: "single" | "parallel" | "chain",
        results: SubagentRunResult[]
      ): SubagentToolDetails => ({
        mode,
        scope,
        workflowId,
        relation: params.relation,
        projectRoot: discovery.projectRoot,
        results,
      });

      if (modeCount !== 1) {
        return {
          content: [{ type: "text", text: "Provide exactly one mode: single, tasks, or chain." }],
          details: makeDetails("single", []),
          isError: true,
        };
      }

      if (subagents.length === 0) {
        return {
          content: [{ type: "text", text: `No subagents available in scope \"${scope}\".` }],
          details: makeDetails(hasChain ? "chain" : hasParallel ? "parallel" : "single", []),
          isError: true,
        };
      }

      if ((scope === "project" || scope === "both") && confirmProjectSubagents && ctx.hasUI) {
        const requested = new Set<string>();
        if (hasSingle && params.subagent) requested.add(params.subagent);
        if (params.tasks) for (const item of params.tasks) requested.add(item.subagent);
        if (params.chain) for (const item of params.chain) requested.add(item.subagent);

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
              details: makeDetails(hasChain ? "chain" : hasParallel ? "parallel" : "single", []),
              isError: true,
            };
          }
        }
      }

      try {
        if (hasSingle && params.subagent && params.task) {
          const title = `${params.subagent} (single)`;
          const running = [makeUnknownResult(params.subagent, params.task, params.relation)];
          running[0].exitCode = -1;
          updateWorkflow(ctx, workflowId, title, toWorkflowLines(makeDetails("single", running)));

          const result = await runSingleSubagent(
            ctx.cwd,
            subagents,
            {
              subagent: params.subagent,
              task: params.task,
              relation: params.relation,
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
            }
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
            relation: item.relation ?? params.relation,
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
                relation: item.relation ?? params.relation,
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
              }
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
                relation: item.relation ?? params.relation,
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
              }
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
          details: makeDetails("single", []),
          isError: true,
        };
      } finally {
        clearWorkflow(ctx, workflowId);
      }
    },

    renderCall(args, theme) {
      const scope: SubagentScope = args.scope ?? "user";

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
      if (!details || details.results.length === 0) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
      }

      const mdTheme = getMarkdownTheme();

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
              text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
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
        if (finalOutput) container.addChild(new Markdown(finalOutput, 0, 0, mdTheme));
        else container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));

        const usage = formatUsageStats(item.usage, modelLabel(item.provider, item.model));
        if (usage) {
          container.addChild(new Spacer(1));
          container.addChild(new Text(theme.fg("dim", usage), 0, 0));
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

        text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
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
          container.addChild(new Markdown(finalOutput, 0, 0, mdTheme));
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
