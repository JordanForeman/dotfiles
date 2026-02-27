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

type OrchestrationSignal = {
  name: string;
  status: string;
  updatedAt: number;
};

type UiModeState = {
  running: Map<string, ToolTask>;
  recent: ToolTask[];
  subtasks: SubtaskUsage[];
  orchestrations: OrchestrationSignal[];
  indicatorsVisible: boolean;
  indicatorsCompact: boolean;
};

type SubagentDetails = {
  mode?: string;
  results?: Array<{
    subagent?: string;
    usage?: {
      contextTokens?: number;
    };
  }>;
  stages?: Array<{
    total?: number;
    done?: number;
    running?: number;
    failed?: number;
  }>;
  orchestrationConfig?: {
    name?: string;
  };
  teams?: Array<{
    id?: string;
    name?: string;
    status?: string;
    stages?: Array<{
      total?: number;
      done?: number;
      running?: number;
      failed?: number;
    }>;
  }>;
};

const MODERN_THEME = "bluloco-modern";
const LEGACY_RAIL_WIDGET_KEY = "ui-modern-rail";
const LEGACY_HEADER_WIDGET_KEY = "ui-modern-header";
const MAX_RECENT = 14;
const MAX_SUBTASKS = 6;
const MAX_ORCHESTRATIONS = 6;

function makeState(): UiModeState {
  return {
    running: new Map<string, ToolTask>(),
    recent: [],
    subtasks: [],
    orchestrations: [],
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
    const single = typeof input.subagent === "string" ? input.subagent : undefined;
    const taskCount = Array.isArray(input.tasks) ? input.tasks.length : 0;
    const teamCount = Array.isArray(input.teams) ? input.teams.length : 0;
    if (single) return `delegate ${single}`;
    if (taskCount > 0) return `delegate ${taskCount} task${taskCount === 1 ? "" : "s"}`;
    if (teamCount > 0) return `teams ${teamCount}`;
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

function clearLegacyUi(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(LEGACY_RAIL_WIDGET_KEY, undefined);
  ctx.ui.setWidget(LEGACY_HEADER_WIDGET_KEY, undefined);
}

function upsertOrchestration(state: UiModeState, name: string, status: string): void {
  const normalized = short(name, 40);
  const next: OrchestrationSignal = {
    name: normalized,
    status: short(status, 16),
    updatedAt: Date.now(),
  };

  const index = state.orchestrations.findIndex((item) => item.name === normalized);
  if (index >= 0) {
    state.orchestrations[index] = next;
  } else {
    state.orchestrations.unshift(next);
  }

  state.orchestrations = state.orchestrations
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ORCHESTRATIONS);
}

function applySubagentDetails(state: UiModeState, detailsRaw: unknown): void {
  if (!detailsRaw || typeof detailsRaw !== "object") return;
  const details = detailsRaw as SubagentDetails;

  if (Array.isArray(details.results)) {
    state.subtasks = details.results
      .map((item) => ({
        name: item.subagent ?? "subagent",
        contextTokens: item.usage?.contextTokens ?? 0,
      }))
      .filter((item) => item.contextTokens > 0)
      .sort((a, b) => b.contextTokens - a.contextTokens)
      .slice(0, MAX_SUBTASKS);
  }

  if (details.mode === "teams" && Array.isArray(details.teams)) {
    for (const team of details.teams) {
      const name = team.name?.trim() || team.id?.trim() || "team";
      const statusRaw = team.status?.trim() || "running";
      const stages = Array.isArray(team.stages) ? team.stages : [];

      let status = statusRaw;
      if (statusRaw === "running" && stages.length > 0) {
        const total = stages.length;
        const completed = stages.filter((stage) => {
          const stageTotal = stage.total ?? 0;
          const stageDone = stage.done ?? 0;
          return stageTotal > 0 && stageDone >= stageTotal;
        }).length;
        status = `${completed}/${total}`;
      }

      upsertOrchestration(state, `team:${name}`, status);
    }
    return;
  }

  const hasOrchestrationSignal =
    details.mode === "orchestration" || Boolean(details.orchestrationConfig?.name) || Array.isArray(details.stages);

  if (!hasOrchestrationSignal) return;

  const name = details.orchestrationConfig?.name?.trim() || "orchestration";
  const stages = Array.isArray(details.stages) ? details.stages : [];

  if (stages.length === 0) {
    upsertOrchestration(state, name, "running");
    return;
  }

  const total = stages.length;
  const completed = stages.filter((stage) => {
    const stageTotal = stage.total ?? 0;
    const stageDone = stage.done ?? 0;
    return stageTotal > 0 && stageDone >= stageTotal;
  }).length;
  const running = stages.filter((stage) => (stage.running ?? 0) > 0).length;
  const failed = stages.filter((stage) => (stage.failed ?? 0) > 0).length;

  let status = "running";
  if (failed > 0) status = "fail";
  else if (completed >= total) status = "done";
  else status = `${completed}/${total}`;

  if (running > 0 && completed < total && failed === 0) {
    status = `${completed}/${total}`;
  }

  upsertOrchestration(state, name, status);
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

function summarizeOrchestrations(state: UiModeState, compact: boolean): string {
  const limit = compact ? 2 : 4;
  const items = state.orchestrations.slice(0, limit).map((item) => {
    const normalizedName = item.name.startsWith("team:") ? item.name.slice(5) : item.name;
    const name = short(normalizedName, compact ? 16 : 20);
    return `${name} ${item.status}`;
  });

  if (items.length === 0) {
    return compact ? "none" : "none running";
  }

  return items.join(" · ");
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
  const orchestrationSummary = summarizeOrchestrations(state, state.indicatorsCompact);

  if (width >= 96) {
    const gap = 3;
    const leftWidth = Math.floor((width - gap) / 2);
    const rightWidth = width - gap - leftWidth;

    const leftPrefix = "tasks · ";
    const rightPrefix = "teams/orch · ";

    const leftBodyWidth = Math.max(8, leftWidth - leftPrefix.length);
    const rightBodyWidth = Math.max(8, rightWidth - rightPrefix.length);

    const leftBody = padRight(truncateToWidth(tasksSummary, leftBodyWidth), leftBodyWidth);
    const rightBody = padRight(truncateToWidth(orchestrationSummary, rightBodyWidth), rightBodyWidth);

    const row2 = `${leftPrefix}${leftBody}${" ".repeat(gap)}${rightPrefix}${rightBody}`;
    return [row1, row2];
  }

  const row2 = truncateToWidth(`tasks · ${tasksSummary}`, width);
  const row3 = truncateToWidth(`teams/orch · ${orchestrationSummary}`, width);
  return [row1, row2, row3];
}

function refreshUI(ctx: ExtensionContext, state: UiModeState, pi: ExtensionAPI): void {
  if (!ctx.hasUI) return;

  applyModernTheme(ctx);
  clearLegacyUi(ctx);
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
        if (line.startsWith("teams/orch")) {
          return theme.fg("dim", line);
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
            `teams/orchestrations tracked: ${state.orchestrations.length}`,
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
      const orchestrationConfig = typeof input.orchestrationConfig === "string" ? input.orchestrationConfig.trim() : "";
      const orchestrationStages = Array.isArray(input.orchestration) ? input.orchestration.length : 0;
      const teams = Array.isArray(input.teams) ? input.teams : [];

      if (teams.length > 0) {
        for (const team of teams) {
          if (!team || typeof team !== "object") continue;
          const name =
            typeof (team as { name?: unknown }).name === "string"
              ? (team as { name?: string }).name!.trim()
              : "team";
          upsertOrchestration(state, `team:${name || "team"}`, "running");
        }
      } else if (orchestrationConfig) {
        upsertOrchestration(state, orchestrationConfig, "running");
      } else if (orchestrationStages > 0) {
        upsertOrchestration(state, `inline-${orchestrationStages}-stage`, "running");
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
    clearLegacyUi(ctx);
    ctx.ui.setHeader(undefined);
    ctx.ui.setFooter(undefined);
  });
}
