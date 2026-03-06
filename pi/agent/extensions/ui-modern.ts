import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

type TaskStatus = "running" | "success" | "error";

type ToolTask = {
  id: string;
  toolName: string;
  summary: string;
  status: TaskStatus;
  startedAt: number;
  endedAt?: number;
  lastUpdate?: string;
};

type SubtaskUsage = {
  name: string;
  contextTokens: number;
};

type DelegationSignal = {
  name: string;
  status: string;
  updatedAt: number;
};

type UiModeState = {
  running: Map<string, ToolTask>;
  recent: ToolTask[];
  subtasks: SubtaskUsage[];
  delegations: DelegationSignal[];
  indicatorsVisible: boolean;
  indicatorsCompact: boolean;
};

type SubagentDetails = {
  mode?: "single" | "parallel" | "chain" | "management" | string;
  results?: Array<{
    agent?: string;
    subagent?: string;
    usage?: {
      contextTokens?: number;
    };
  }>;
  chainAgents?: string[];
  totalSteps?: number;
  currentStepIndex?: number;
};

const MODERN_THEME = "bluloco-modern";
const RAIL_WIDGET_KEY = "ui-modern-rail";
const HEADER_WIDGET_KEY = "ui-modern-header";
const MAX_RECENT = 14;
const MAX_SUBTASKS = 6;
const MAX_DELEGATIONS = 6;

function makeState(): UiModeState {
  return {
    running: new Map<string, ToolTask>(),
    recent: [],
    subtasks: [],
    delegations: [],
    indicatorsVisible: true,
    indicatorsCompact: false,
  };
}

function short(text: string, max = 64): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

function makeMeter(percent: number, slots = 10): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * slots);
  return `[${"█".repeat(filled)}${"░".repeat(Math.max(0, slots - filled))}]`;
}

function toFinitePercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSafeMode(activeTools: string[]): "on" | "off" {
  const names = new Set(activeTools.map((tool) => tool.toLowerCase()));
  const mutating = ["edit", "write", "bash"].some((tool) => names.has(tool));
  return mutating ? "off" : "on";
}

function summarizeInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "bash") return short(String(input.command ?? "bash"), 80);
  if (toolName === "read") return `read ${short(String(input.path ?? "?"), 70)}`;
  if (toolName === "edit") return `edit ${short(String(input.path ?? "?"), 70)}`;
  if (toolName === "write") return `write ${short(String(input.path ?? "?"), 70)}`;
  if (toolName === "subagent") {
    const single = typeof input.agent === "string" ? input.agent : undefined;
    const parallelCount = Array.isArray(input.tasks) ? input.tasks.length : 0;
    const chainCount = Array.isArray(input.chain) ? input.chain.length : 0;
    if (single) return `run ${single}`;
    if (chainCount > 0) return `chain ${chainCount}`;
    if (parallelCount > 0) return `parallel ${parallelCount}`;
    return "delegate";
  }
  return `${toolName}`;
}

function extractText(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const part = item as { type?: string; text?: string };
      return part.type === "text" && typeof part.text === "string" ? part.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function formatDuration(startedAt: number, endedAt?: number): string {
  const end = endedAt ?? Date.now();
  const ms = Math.max(0, end - startedAt);
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 100) / 10;
  return `${sec}s`;
}

function applyModernTheme(ctx: ExtensionContext): void {
  const themes = ctx.ui.getAllThemes();
  if (!themes.some((theme) => theme.name === MODERN_THEME)) return;

  if (ctx.ui.theme.name !== MODERN_THEME) {
    ctx.ui.setTheme(MODERN_THEME);
  }
}

function clearWidgets(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(RAIL_WIDGET_KEY, undefined);
  ctx.ui.setWidget(HEADER_WIDGET_KEY, undefined);
}

function upsertDelegation(state: UiModeState, name: string, status: string): void {
  const normalized = short(name, 40);
  const next: DelegationSignal = {
    name: normalized,
    status: short(status, 16),
    updatedAt: Date.now(),
  };

  const index = state.delegations.findIndex((item) => item.name === normalized);
  if (index >= 0) {
    state.delegations[index] = next;
  } else {
    state.delegations.unshift(next);
  }

  state.delegations = state.delegations
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_DELEGATIONS);
}

function applySubagentDetails(state: UiModeState, detailsRaw: unknown): void {
  if (!detailsRaw || typeof detailsRaw !== "object") return;
  const details = detailsRaw as SubagentDetails;

  if (Array.isArray(details.results)) {
    state.subtasks = details.results
      .map((item) => ({
        name: item.agent ?? item.subagent ?? "agent",
        contextTokens: item.usage?.contextTokens ?? 0,
      }))
      .filter((item) => item.contextTokens > 0)
      .sort((a, b) => b.contextTokens - a.contextTokens)
      .slice(0, MAX_SUBTASKS);
  }

  if (details.mode === "chain") {
    const chainName =
      Array.isArray(details.chainAgents) && details.chainAgents.length > 0
        ? details.chainAgents.join("→")
        : "chain";
    const total = details.totalSteps ?? details.chainAgents?.length ?? 0;
    const current = typeof details.currentStepIndex === "number" ? details.currentStepIndex + 1 : undefined;
    const status = total > 0 ? `${Math.min(current ?? 0, total)}/${total}` : "running";
    upsertDelegation(state, chainName, status);
    return;
  }

  if (details.mode === "parallel") {
    const total = Array.isArray(details.results) ? details.results.length : 0;
    upsertDelegation(state, "parallel", total > 0 ? `${total} done` : "running");
    return;
  }

  if (details.mode === "single") {
    const agentName = details.results?.[0]?.agent ?? details.results?.[0]?.subagent ?? "agent";
    upsertDelegation(state, `run:${agentName}`, "done");
  }
}

function summarizeSubtasks(state: UiModeState, usageTotal: number, compact: boolean): string {
  const limit = compact ? 2 : 4;
  const items = state.subtasks.slice(0, limit).map((item) => {
    const name = short(item.name, compact ? 16 : 20);
    if (usageTotal > 0) {
      const pct = Math.max(0, Math.round((item.contextTokens / usageTotal) * 100));
      return `${name} ${pct}%`;
    }
    return `${name} ${item.contextTokens.toLocaleString()}t`;
  });

  if (items.length === 0) {
    return compact ? "none" : "no active tasks yet";
  }

  return items.join(" · ");
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function summarizeDelegations(state: UiModeState, compact: boolean): string {
  const limit = compact ? 2 : 4;
  const staleThresholdMs = 90_000;
  const now = Date.now();
  const items = state.delegations.slice(0, limit).map((item) => {
    const name = short(item.name, compact ? 16 : 20);
    const ageMs = now - item.updatedAt;
    const stale = ageMs >= staleThresholdMs ? "⚠" : "";
    return `${name} ${item.status} ${formatElapsed(ageMs)}${stale}`.trim();
  });

  if (items.length === 0) {
    return compact ? "none" : "none running";
  }

  return items.join(" · ");
}

function summarizeActiveWork(state: UiModeState): string | null {
  const running = Array.from(state.running.values()).sort((a, b) => b.startedAt - a.startedAt);
  const active = running[0];
  if (!active) return null;

  const age = formatElapsed(Date.now() - active.startedAt);
  const update = active.lastUpdate ? short(active.lastUpdate, 72) : short(active.summary, 72);
  return `${active.toolName} ${age} · ${update}`;
}

function buildFooterRows(ctx: ExtensionContext, state: UiModeState, pi: ExtensionAPI, width: number): string[] {
  const usage = ctx.getContextUsage();
  const safe = getSafeMode(pi.getActiveTools());
  const thinking = pi.getThinkingLevel();

  const modelPlain = short(`${ctx.model?.provider}/${ctx.model?.id}`, Math.max(18, Math.floor(width * 0.4)));
  const thinkingPlain = `thinking ${thinking}`;
  const safePlain = `safe ${safe}`;
  const usagePercent = toFinitePercent(usage?.percent);
  const usagePlain = usagePercent === null ? "ctx unknown" : `${makeMeter(usagePercent)} ${usagePercent.toFixed(0)}%`;

  const leftPlain = `${modelPlain} · ${thinkingPlain}`;
  const rightPlain = `${safePlain} · ${usagePlain}`;
  let row1 = leftPlain;
  if (leftPlain.length + rightPlain.length + 1 <= width) {
    row1 = `${leftPlain}${" ".repeat(Math.max(1, width - leftPlain.length - rightPlain.length))}${rightPlain}`;
  } else {
    row1 = truncateToWidth(`${leftPlain} · ${rightPlain}`, width);
  }

  if (!state.indicatorsVisible) {
    return [row1];
  }

  const usageTotal = usage?.tokens ?? 0;
  const tasksSummary = summarizeSubtasks(state, usageTotal, state.indicatorsCompact);
  const delegationSummary = summarizeDelegations(state, state.indicatorsCompact);
  const activeWorkSummary = summarizeActiveWork(state);

  if (width >= 96) {
    const gap = 3;
    const leftWidth = Math.floor((width - gap) / 2);
    const rightWidth = width - gap - leftWidth;

    const leftPrefix = "tasks · ";
    const rightPrefix = "delegation · ";

    const leftBodyWidth = Math.max(8, leftWidth - leftPrefix.length);
    const rightBodyWidth = Math.max(8, rightWidth - rightPrefix.length);

    const leftBody = padRight(truncateToWidth(tasksSummary, leftBodyWidth), leftBodyWidth);
    const rightBody = padRight(truncateToWidth(delegationSummary, rightBodyWidth), rightBodyWidth);

    const row2 = `${leftPrefix}${leftBody}${" ".repeat(gap)}${rightPrefix}${rightBody}`;
    const rows = [row1, row2];
    if (activeWorkSummary) {
      rows.push(truncateToWidth(`active · ${activeWorkSummary}`, width));
    }
    return rows;
  }

  const row2 = truncateToWidth(`tasks · ${tasksSummary}`, width);
  const row3 = truncateToWidth(`delegation · ${delegationSummary}`, width);
  const rows = [row1, row2, row3];
  if (activeWorkSummary) {
    rows.push(truncateToWidth(`active · ${activeWorkSummary}`, width));
  }
  return rows;
}

function refreshUI(ctx: ExtensionContext, state: UiModeState, pi: ExtensionAPI): void {
  if (!ctx.hasUI) return;

  applyModernTheme(ctx);
  clearWidgets(ctx);
  ctx.ui.setHeader(undefined);

  ctx.ui.setFooter((_tui, theme) => ({
    invalidate() {},
    render(width: number): string[] {
      const rows = buildFooterRows(ctx, state, pi, width);
      return rows.map((row, index) => {
        const line = truncateToWidth(row, width);
        if (index === 0) {
          return theme.fg("text", line);
        }
        if (line.startsWith("tasks")) {
          return theme.fg("muted", line);
        }
        if (line.startsWith("delegation")) {
          return theme.fg("dim", line);
        }
        if (line.startsWith("active")) {
          return theme.fg("warning", line);
        }
        return theme.fg("muted", line);
      });
    },
  }));
}

export default function uiModern(pi: ExtensionAPI) {
  const state = makeState();

  pi.registerCommand("ui-modern", {
    description: "Configure modern UI footer indicators",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const tokens = (args ?? "")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      const [cmd, arg] = tokens;

      if (!cmd || cmd === "status") {
        const usage = ctx.getContextUsage();
        const usagePercent = toFinitePercent(usage?.percent);
        ctx.ui.notify(
          [
            "ui-modern: enabled (default)",
            `footer indicators: visible=${state.indicatorsVisible}, compact=${state.indicatorsCompact}`,
            `running tasks: ${state.running.size}`,
            `subtasks tracked: ${state.subtasks.length}`,
            `delegations tracked: ${state.delegations.length}`,
            usagePercent === null ? "context: unknown" : `context: ${usagePercent.toFixed(1)}%`,
          ].join("\n"),
          "info"
        );
        return;
      }

      if (cmd === "refresh") {
        refreshUI(ctx, state, pi);
        ctx.ui.notify("ui-modern refreshed", "info");
        return;
      }

      if (cmd === "tasks") {
        const tasks = [...Array.from(state.running.values()), ...state.recent].slice(0, 8);
        if (tasks.length === 0) {
          ctx.ui.notify("No background tasks recorded yet.", "info");
          return;
        }

        const lines = tasks.map(
          (task) =>
            `${task.status === "running" ? "●" : task.status === "success" ? "✓" : "✕"} ${task.summary} (${formatDuration(task.startedAt, task.endedAt)})`
        );
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (cmd === "indicators" || cmd === "header") {
        const action = arg || "toggle";

        if (action === "toggle") {
          state.indicatorsVisible = !state.indicatorsVisible;
        } else if (action === "show" || action === "on") {
          state.indicatorsVisible = true;
        } else if (action === "hide" || action === "off") {
          state.indicatorsVisible = false;
        } else if (action === "compact" || action === "collapse") {
          state.indicatorsVisible = true;
          state.indicatorsCompact = true;
        } else if (action === "full" || action === "expand") {
          state.indicatorsVisible = true;
          state.indicatorsCompact = false;
        } else {
          ctx.ui.notify("Usage: /ui-modern indicators [toggle|show|hide|compact|full]", "warning");
          return;
        }

        refreshUI(ctx, state, pi);
        return;
      }

      ctx.ui.notify("Usage: /ui-modern [status|tasks|refresh|indicators ...]", "warning");
    },
  });

  pi.on("input", async (event, ctx) => {
    if (!ctx.hasUI) return;
    const text = event.text.trim().toLowerCase();
    if (text.startsWith("/thinking") || text.startsWith("/think ")) {
      setTimeout(() => refreshUI(ctx, state, pi), 10);
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    refreshUI(ctx, state, pi);
  });

  pi.on("session_switch", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    refreshUI(ctx, state, pi);
  });

  pi.on("model_select", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    refreshUI(ctx, state, pi);
  });

  pi.on("message_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    refreshUI(ctx, state, pi);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    const input = (event.args ?? {}) as Record<string, unknown>;
    state.running.set(event.toolCallId, {
      id: event.toolCallId,
      toolName: event.toolName,
      summary: summarizeInput(event.toolName, input),
      status: "running",
      startedAt: Date.now(),
    });

    if (event.toolName === "subagent") {
      const single = typeof input.agent === "string" ? input.agent.trim() : "";
      const chain = Array.isArray(input.chain) ? input.chain : [];
      const tasks = Array.isArray(input.tasks) ? input.tasks : [];

      if (single) {
        upsertDelegation(state, `run:${single}`, "running");
      } else if (chain.length > 0) {
        upsertDelegation(state, "chain", `0/${chain.length}`);
      } else if (tasks.length > 0) {
        upsertDelegation(state, "parallel", `0/${tasks.length}`);
      }
    }

    if (!ctx.hasUI) return;
    refreshUI(ctx, state, pi);
  });

  pi.on("tool_execution_update", async (event, ctx) => {
    const task = state.running.get(event.toolCallId);
    if (task) {
      const text = extractText((event.partialResult as { content?: unknown[] } | undefined)?.content);
      if (text.trim()) {
        task.lastUpdate = short(text.split("\n").slice(-1)[0] ?? "", 80);
      }
    }

    if (event.toolName === "subagent") {
      const partialDetails = (event.partialResult as { details?: unknown } | undefined)?.details;
      applySubagentDetails(state, partialDetails);
    }

    if (!ctx.hasUI) return;
    refreshUI(ctx, state, pi);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const task = state.running.get(event.toolCallId);
    if (task) {
      state.running.delete(event.toolCallId);
      task.status = event.isError ? "error" : "success";
      task.endedAt = Date.now();
      state.recent.unshift(task);
      state.recent = state.recent.slice(0, MAX_RECENT);
    }

    if (event.toolName === "subagent") {
      const resultDetails = (event.result as { details?: unknown } | undefined)?.details;
      applySubagentDetails(state, resultDetails);
    }

    if (!ctx.hasUI) return;
    refreshUI(ctx, state, pi);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === "subagent") {
      applySubagentDetails(state, event.details);
    }

    if (!ctx.hasUI) return;
    refreshUI(ctx, state, pi);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    clearWidgets(ctx);
    ctx.ui.setHeader(undefined);
    ctx.ui.setFooter(undefined);
  });
}
