import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { InterceptorExtensionCore } from "./base";
import type { AutocompleteItem } from "@mariozechner/pi-tui";
import { SessionHealthMonitor, type HealthReport } from "./health-monitor";

// ─── Defaults & Constants ────────────────────────────────────────────────────

/** Baseline sensitivity: 0 = never suggest, 1 = suggest at slightest signal */
const DEFAULT_SENSITIVITY = 0.5;
const MIN_SENSITIVITY = 0.05;
const MAX_SENSITIVITY = 1.0;

/** Health score below this triggers a user prompt (scaled by sensitivity) */
const BASE_HEALTH_FLOOR = 0.5;

/** Hard ceiling: always prompt above this context percentage regardless of signals */
const HARD_CEILING = 0.85;

/** Minimum context pressure before we even bother checking heuristics */
const MONITORING_FLOOR = 0.25;

/** After user snoozes, wait this many agent turns before re-checking */
const DEFAULT_SNOOZE_TURNS = 5;

const SETTINGS_KEY = "contextThreshold";

// ─── Persistence ─────────────────────────────────────────────────────────────

function getAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR?.trim();
  if (!configured) return path.join(os.homedir(), ".pi", "agent");
  if (configured === "~") return os.homedir();
  if (configured.startsWith("~/")) return path.join(os.homedir(), configured.slice(2));
  return configured;
}

interface PersistedSettings {
  sensitivity?: number;
}

async function loadPersistedSettings(): Promise<PersistedSettings> {
  try {
    const settingsPath = path.join(getAgentDir(), "settings.json");
    const raw = await fs.readFile(settingsPath, "utf8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const block = settings[SETTINGS_KEY];
    if (typeof block === "object" && block !== null) return block as PersistedSettings;
    // Migrate old numeric format (plain threshold) → sensitivity
    if (typeof block === "number") return { sensitivity: block };
  } catch {
    // No settings or parse error — use defaults
  }
  return {};
}

async function persistSettings(data: PersistedSettings): Promise<string> {
  const settingsPath = path.join(getAgentDir(), "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code !== "ENOENT") throw error;
  }
  settings[SETTINGS_KEY] = data;
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settingsPath;
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function bar(ratio: number, width = 20): string {
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// ─── Extension ───────────────────────────────────────────────────────────────

class ContextThresholdExtension extends InterceptorExtensionCore {
  private monitor = new SessionHealthMonitor();
  private sensitivity = DEFAULT_SENSITIVITY;
  private compacting = false;
  private snoozedUntilTurn = 0;
  private turnCount = 0;
  private dismissed = false; // user said "I'm fine" for this session

  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "context-threshold",
      name: "Context Threshold",
      summary: "Adaptive compaction with multi-signal session health monitoring",
    });
  }

  protected registerExtension(): void {
    this.registerEventHandlers();
    this.registerCommands();
  }

  // ── Event wiring ─────────────────────────────────────────────────────────

  private registerEventHandlers(): void {
    // Restore persisted sensitivity on session start
    this.pi.on("session_start", async () => {
      const saved = await loadPersistedSettings();
      if (
        saved.sensitivity !== undefined &&
        saved.sensitivity >= MIN_SENSITIVITY &&
        saved.sensitivity <= MAX_SENSITIVITY
      ) {
        this.sensitivity = saved.sensitivity;
      }
      this.monitor.reset();
      this.turnCount = 0;
      this.snoozedUntilTurn = 0;
      this.dismissed = false;
      this.compacting = false;
    });

    // Track tool outcomes
    this.pi.on("tool_execution_end", async (event) => {
      this.monitor.trackToolResult(event.toolName, !!event.isError);

      // Track file reads for re-read detection
      if (event.toolName === "read" && !event.isError) {
        const input = event as { input?: { path?: string } };
        if (input.input?.path) {
          this.monitor.trackFileRead(input.input.path);
        }
      }
    });

    // Track tool call args (for read path extraction when tool_execution_end doesn't have input)
    this.pi.on("tool_call", async (event) => {
      if (event.toolName === "read" && event.input?.path) {
        this.monitor.trackFileRead(event.input.path as string);
      }
    });

    // Track assistant message content for hedging detection
    this.pi.on("message_end", async (event) => {
      const msg = event.message;
      if (msg.role === "assistant" && msg.content) {
        const text = Array.isArray(msg.content)
          ? msg.content
              .filter((b: { type: string }) => b.type === "text")
              .map((b: { text: string }) => b.text)
              .join("\n")
          : String(msg.content);
        if (text) this.monitor.trackAssistantMessage(text);
      }
    });

    // Track turns and evaluate health at agent_end
    this.pi.on("agent_end", async (_event, ctx) => {
      this.turnCount++;
      this.monitor.trackTurn();
      await this.evaluateAndMaybePrompt(ctx);
    });
  }

  // ── Core evaluation logic ────────────────────────────────────────────────

  private async evaluateAndMaybePrompt(ctx: ExtensionContext): Promise<void> {
    if (this.compacting || this.dismissed) return;
    if (this.turnCount <= this.snoozedUntilTurn) return;
    if (!ctx.hasUI) return;

    const usage = ctx.getContextUsage();
    if (!usage) return;

    const contextPressure = usage.tokens / usage.contextWindow;

    // Don't bother checking below the monitoring floor
    if (contextPressure < MONITORING_FLOOR) return;

    // Hard ceiling: always prompt
    if (contextPressure >= HARD_CEILING) {
      await this.promptUser(ctx, this.monitor.getReport(contextPressure), "ceiling");
      return;
    }

    // Compute effective health threshold based on sensitivity
    // Higher sensitivity → higher threshold → triggers sooner
    const effectiveFloor = BASE_HEALTH_FLOOR + (this.sensitivity - 0.5) * 0.4;
    const report = this.monitor.getReport(contextPressure);

    if (report.health < effectiveFloor) {
      await this.promptUser(ctx, report, "health");
      return;
    }

    // Update footer status with health info when above monitoring floor
    const healthIcon = report.health > 0.7 ? "●" : report.health > 0.4 ? "◐" : "○";
    ctx.ui.setStatus(
      "context",
      `${healthIcon} ctx:${pct(contextPressure)} health:${pct(report.health)}`,
    );
  }

  // ── User engagement ──────────────────────────────────────────────────────

  private async promptUser(
    ctx: ExtensionContext,
    report: HealthReport,
    reason: "ceiling" | "health",
  ): Promise<void> {
    const reasonText =
      reason === "ceiling"
        ? `Context at ${pct(report.contextPressure)} — approaching hard ceiling.`
        : `Session health declining (${pct(report.health)}).`;

    const signalLines = this.formatSignals(report);

    const title = `⚡ ${reasonText}\n${signalLines}\n\nCompact now?`;

    const choice = await ctx.ui.select(title, [
      "Compact now",
      "Not yet — ask again in 5 turns",
      "Not yet — ask again in 10 turns",
      "I'm fine — don't ask again this session",
      "More sensitive (compact sooner)",
      "Less sensitive (compact later)",
    ]);

    switch (choice) {
      case "Compact now":
        this.doCompact(ctx);
        break;

      case "Not yet — ask again in 5 turns":
        this.snoozedUntilTurn = this.turnCount + DEFAULT_SNOOZE_TURNS;
        this.nudgeSensitivity(-0.05);
        ctx.ui.notify(
          `Snoozed for ${DEFAULT_SNOOZE_TURNS} turns. Sensitivity: ${pct(this.sensitivity)}`,
          "info",
        );
        break;

      case "Not yet — ask again in 10 turns":
        this.snoozedUntilTurn = this.turnCount + 10;
        this.nudgeSensitivity(-0.1);
        ctx.ui.notify(`Snoozed for 10 turns. Sensitivity: ${pct(this.sensitivity)}`, "info");
        break;

      case "I'm fine — don't ask again this session":
        this.dismissed = true;
        this.nudgeSensitivity(-0.15);
        ctx.ui.notify(
          `Dismissed for this session. Sensitivity: ${pct(this.sensitivity)}`,
          "info",
        );
        break;

      case "More sensitive (compact sooner)":
        this.nudgeSensitivity(+0.1);
        ctx.ui.notify(`Sensitivity increased to ${pct(this.sensitivity)}. Compacting…`, "info");
        this.doCompact(ctx);
        break;

      case "Less sensitive (compact later)":
        this.nudgeSensitivity(-0.1);
        this.snoozedUntilTurn = this.turnCount + DEFAULT_SNOOZE_TURNS;
        ctx.ui.notify(
          `Sensitivity decreased to ${pct(this.sensitivity)}. Snoozed for ${DEFAULT_SNOOZE_TURNS} turns.`,
          "info",
        );
        break;

      default:
        // Escaped / cancelled — treat as short snooze
        this.snoozedUntilTurn = this.turnCount + 3;
        break;
    }
  }

  private formatSignals(report: HealthReport): string {
    const lines: string[] = [];
    const { signals } = report;

    lines.push(`  Context:    ${bar(signals.contextPressure)} ${pct(signals.contextPressure)}`);

    if (signals.toolErrorRate > 0) {
      lines.push(
        `  Tool errors: ${bar(signals.toolErrorRate)} ${pct(signals.toolErrorRate)} (${signals.toolErrorCount}/${signals.toolCallCount} recent)`,
      );
    }

    if (signals.reReadRatio > 0) {
      lines.push(
        `  Re-reads:   ${bar(signals.reReadRatio)} ${pct(signals.reReadRatio)} (${signals.reReadCount} files re-read)`,
      );
    }

    if (signals.repetitionScore > 0) {
      lines.push(`  Repetition: ${bar(signals.repetitionScore)} ${pct(signals.repetitionScore)}`);
    }

    if (signals.hedgingScore > 0) {
      lines.push(`  Hedging:    ${bar(signals.hedgingScore)} ${pct(signals.hedgingScore)}`);
    }

    lines.push(`  Health:     ${bar(report.health)} ${pct(report.health)}`);
    lines.push(`  Sensitivity: ${pct(this.sensitivity)}`);

    return lines.join("\n");
  }

  private doCompact(ctx: ExtensionContext): void {
    this.compacting = true;
    ctx.ui.setStatus("context", "⟳ Compacting…");
    ctx.compact({
      customInstructions:
        "Proactive compaction triggered by session health monitor. " +
        "Preserve all essential context: current task, decisions made, file state, and recent findings.",
      onComplete: () => {
        this.compacting = false;
        this.monitor.reset();
        ctx.ui.setStatus("context", undefined);
        ctx.ui.notify("Proactive compaction complete.", "success");
      },
      onError: (error) => {
        this.compacting = false;
        ctx.ui.setStatus("context", undefined);
        ctx.ui.notify(`Proactive compaction failed: ${error.message}`, "error");
      },
    });
  }

  private nudgeSensitivity(delta: number): void {
    this.sensitivity = Math.max(MIN_SENSITIVITY, Math.min(MAX_SENSITIVITY, this.sensitivity + delta));
  }

  // ── Commands ─────────────────────────────────────────────────────────────

  private registerCommands(): void {
    this.pi.registerCommand("context", {
      description: "View session health, adjust compaction sensitivity",
      getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
        const subs = ["status", "sensitivity", "persist", "reset", "help"];
        const trimmed = prefix.trimStart().toLowerCase();
        const items = subs.filter((v) => v.startsWith(trimmed)).map((v) => ({ value: v, label: v }));
        return items.length > 0 ? items : null;
      },
      handler: async (args, ctx) => {
        const input = (args ?? "").trim();
        const [command, ...rest] = input.split(/\s+/);
        const sub = command?.toLowerCase() ?? "";

        if (!input || sub === "status") return this.cmdStatus(ctx);
        if (sub === "sensitivity") return this.cmdSensitivity(rest.join(" "), ctx);
        if (sub === "persist") return this.cmdPersist(ctx);
        if (sub === "reset") return this.cmdReset(ctx);
        if (sub === "help") {
          ctx.ui.notify(commandUsage(), "info");
          return;
        }

        // Bare number → set sensitivity
        const parsed = parseValue(input);
        if (parsed !== undefined) return this.cmdSensitivity(input, ctx);

        ctx.ui.notify(`Unknown: "${command}"\n\n${commandUsage()}`, "warning");
      },
    });
  }

  private cmdStatus(ctx: ExtensionCommandContext): void {
    const usage = ctx.getContextUsage();
    const contextPressure = usage ? usage.tokens / usage.contextWindow : 0;
    const report = this.monitor.getReport(contextPressure);
    const { signals } = report;

    const lines = [
      `Session Health Report`,
      `─────────────────────`,
      `  Context:     ${pct(contextPressure)}${usage ? ` (${tokens(usage.tokens)}/${tokens(usage.contextWindow)})` : ""}`,
      `  Tool errors: ${signals.toolCallCount > 0 ? `${pct(signals.toolErrorRate)} (${signals.toolErrorCount}/${signals.toolCallCount})` : "none"}`,
      `  Re-reads:    ${signals.reReadCount > 0 ? `${pct(signals.reReadRatio)} (${signals.reReadCount} files)` : "none"}`,
      `  Repetition:  ${signals.repetitionScore > 0 ? pct(signals.repetitionScore) : "none"}`,
      `  Hedging:     ${signals.hedgingScore > 0 ? pct(signals.hedgingScore) : "none"}`,
      ``,
      `  Overall:     ${bar(report.health)} ${pct(report.health)}`,
      `  Sensitivity: ${pct(this.sensitivity)}`,
      `  Turns:       ${this.turnCount}`,
      `  Snoozed:     ${this.snoozedUntilTurn > this.turnCount ? `until turn ${this.snoozedUntilTurn}` : "no"}`,
      `  Dismissed:   ${this.dismissed ? "yes" : "no"}`,
    ];

    ctx.ui.notify(lines.join("\n"), "info");
  }

  private cmdSensitivity(value: string, ctx: ExtensionCommandContext): void {
    const parsed = parseValue(value.trim());
    if (parsed === undefined) {
      ctx.ui.notify(
        `Current sensitivity: ${pct(this.sensitivity)}\nSet with: /context sensitivity 0.6`,
        "info",
      );
      return;
    }
    if (parsed < MIN_SENSITIVITY || parsed > MAX_SENSITIVITY) {
      ctx.ui.notify(
        `Sensitivity must be between ${pct(MIN_SENSITIVITY)} and ${pct(MAX_SENSITIVITY)}.`,
        "warning",
      );
      return;
    }
    this.sensitivity = parsed;
    this.snoozedUntilTurn = 0; // reset snooze on manual change
    this.dismissed = false;
    ctx.ui.notify(`Sensitivity set to ${pct(parsed)}.`, "info");
  }

  private async cmdPersist(ctx: ExtensionCommandContext): Promise<void> {
    try {
      const p = await persistSettings({ sensitivity: this.sensitivity });
      ctx.ui.notify(`Sensitivity ${pct(this.sensitivity)} persisted to ${p}.`, "info");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Failed to persist: ${msg}`, "error");
    }
  }

  private cmdReset(ctx: ExtensionCommandContext): void {
    this.sensitivity = DEFAULT_SENSITIVITY;
    this.monitor.reset();
    this.snoozedUntilTurn = 0;
    this.dismissed = false;
    ctx.ui.notify(`Reset to defaults. Sensitivity: ${pct(this.sensitivity)}`, "info");
  }
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function parseValue(input: string): number | undefined {
  if (!input) return undefined;
  const m = input.match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (m) {
    const n = parseFloat(m[1]);
    return n > 1 ? n / 100 : n;
  }
  const d = parseFloat(input);
  if (!isNaN(d) && d > 0 && d <= 1) return d;
  return undefined;
}

function commandUsage(): string {
  return [
    "Usage:",
    "  /context                    # full health report",
    "  /context status             # full health report",
    "  /context sensitivity 0.6    # set sensitivity (session only)",
    "  /context sensitivity 60%    # same thing",
    "  /context persist            # save current sensitivity to settings.json",
    "  /context reset              # reset to defaults",
    "  /context help               # show this help",
    "",
    "Sensitivity: 0 = never suggest compaction, 1 = suggest at slightest signal.",
    "Default: 50%. User feedback (snooze/dismiss/accept) auto-adjusts sensitivity.",
  ].join("\n");
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export default function contextThreshold(pi: ExtensionAPI) {
  new ContextThresholdExtension(pi).register();
}
