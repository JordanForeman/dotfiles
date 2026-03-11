import fs from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type, type Static } from "@sinclair/typebox";
import {
  Key,
  matchesKey,
  truncateToWidth,
} from "@mariozechner/pi-tui";

// ─────────────────────────────────── constants ──────────────────────────────

const STATUS_KEY = "autoresearch";
const AR_DIR = ".autoresearch";
const CONFIG_FILE = "config.json";
const LOG_FILE = "results.tsv";
const TSV_HEADER = "iteration\tcommit\tscore\tstatus\tdescription\ttimestamp";

// ─────────────────────────────────── types ───────────────────────────────────

interface ArConfig {
  objective: string;
  benchmarkCommand: string;
  metricRegex: string;
  direction: "minimize" | "maximize";
  timeoutSeconds: number;
  branch: string;
  createdAt: string;
}

type ArStatus = "keep" | "discard" | "crash" | "baseline";

interface ArRun {
  iteration: number;
  commit: string;
  score: number | null;
  status: ArStatus;
  description: string;
  timestamp: string;
}

// ─────────────────────────────────── tool schema ────────────────────────────

const ArLoopSchema = Type.Object({
  action: StringEnum(["benchmark", "iterate"] as const, {
    description:
      "benchmark = measure only (no commit/revert); iterate = measure, then keep if improved or revert",
  }),
  label: Type.String({
    description: "Short description of what this experiment tries (e.g. 'double width', 'baseline')",
  }),
});

type ArLoopInput = Static<typeof ArLoopSchema>;

// ─────────────────────────────────── file helpers ───────────────────────────

function arDir(cwd: string) {
  return path.join(cwd, AR_DIR);
}
function cfgPath(cwd: string) {
  return path.join(arDir(cwd), CONFIG_FILE);
}
function logPath(cwd: string) {
  return path.join(arDir(cwd), LOG_FILE);
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadConfig(cwd: string): Promise<ArConfig | null> {
  const p = cfgPath(cwd);
  if (!(await exists(p))) return null;
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as ArConfig;
  } catch {
    return null;
  }
}

async function saveConfig(cwd: string, cfg: ArConfig) {
  await fs.mkdir(arDir(cwd), { recursive: true });
  await fs.writeFile(cfgPath(cwd), JSON.stringify(cfg, null, 2) + "\n");
}

async function loadRuns(cwd: string): Promise<ArRun[]> {
  const p = logPath(cwd);
  if (!(await exists(p))) return [];
  const lines = (await fs.readFile(p, "utf8")).split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1).map(parseTsvLine).filter((r): r is ArRun => r !== null);
}

function parseTsvLine(line: string): ArRun | null {
  const f = line.split("\t");
  if (f.length < 6) return null;
  const iter = parseInt(f[0], 10);
  const score = f[2] === "-" ? null : parseFloat(f[2]);
  const status = f[3] as ArStatus;
  if (!["keep", "discard", "crash", "baseline"].includes(status)) return null;
  return {
    iteration: isNaN(iter) ? 0 : iter,
    commit: f[1],
    score: isNaN(score as number) ? null : score,
    status,
    description: f[4],
    timestamp: f[5],
  };
}

async function appendRun(cwd: string, run: ArRun) {
  const p = logPath(cwd);
  await fs.mkdir(arDir(cwd), { recursive: true });
  if (!(await exists(p))) await fs.writeFile(p, TSV_HEADER + "\n");
  const line = [
    run.iteration,
    run.commit,
    run.score === null ? "-" : run.score,
    run.status,
    run.description.replace(/\t/g, " ").replace(/\r?\n/g, " "),
    run.timestamp,
  ].join("\t");
  await fs.appendFile(p, line + "\n");
}

// ─────────────────────────────────── scoring ────────────────────────────────

function bestKept(
  runs: ArRun[],
  dir: ArConfig["direction"],
): { score: number; commit: string } | null {
  const kept = runs.filter(
    (r) => (r.status === "keep" || r.status === "baseline") && r.score !== null,
  );
  if (!kept.length) return null;
  return kept.reduce((best, cur) => {
    if (cur.score === null) return best;
    const dominated =
      dir === "minimize" ? cur.score < best.score! : cur.score > best.score!;
    return dominated ? cur : best;
  }) as { score: number; commit: string };
}

function improved(
  cfg: ArConfig,
  score: number,
  runs: ArRun[],
): boolean {
  const best = bestKept(runs, cfg.direction);
  if (!best) return true;
  return cfg.direction === "minimize" ? score < best.score : score > best.score;
}

function nextIter(runs: ArRun[]) {
  return runs.length ? runs[runs.length - 1].iteration + 1 : 1;
}

function dirLabel(d: ArConfig["direction"]) {
  return d === "minimize" ? "lower is better" : "higher is better";
}

function fmtScore(s: number | null) {
  return s === null ? "-" : s.toFixed(6);
}

// ─────────────────────────────────── metric parsing ─────────────────────────

function parseScore(output: string, regex: string): number | null {
  try {
    const m = new RegExp(regex, "m").exec(output);
    if (!m) return null;
    const raw = m.groups?.score ?? m[1] ?? m[0];
    const numMatch = raw.match(/-?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!numMatch) return null;
    const v = parseFloat(numMatch[0]);
    return isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────── git helpers ────────────────────────────

async function git(pi: ExtensionAPI, cwd: string, args: string[]) {
  try {
    return await pi.exec("git", args, { cwd });
  } catch (e) {
    return { code: 1, stdout: "", stderr: String(e), killed: false };
  }
}

async function shortHead(pi: ExtensionAPI, cwd: string) {
  const r = await git(pi, cwd, ["rev-parse", "--short", "HEAD"]);
  return r.code === 0 ? r.stdout.trim() : null;
}

async function isGitRepo(pi: ExtensionAPI, cwd: string) {
  const r = await git(pi, cwd, ["rev-parse", "--is-inside-work-tree"]);
  return r.code === 0 && r.stdout.trim() === "true";
}

async function hasStagedOrTrackedChanges(pi: ExtensionAPI, cwd: string) {
  const r = await git(pi, cwd, ["status", "--short", "--untracked-files=no"]);
  return r.stdout.trim().length > 0;
}

// ─────────────────────────────────── benchmark runner ───────────────────────

async function runBenchmark(
  pi: ExtensionAPI,
  cwd: string,
  command: string,
  timeout: number,
) {
  const t0 = Date.now();
  try {
    const r = await pi.exec("bash", ["-lc", command], {
      cwd,
      timeout: timeout * 1000,
    });
    return {
      output: r.stdout + (r.stderr ? "\n" + r.stderr : ""),
      code: r.code,
      killed: r.killed,
      ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      output: String(e),
      code: 1,
      killed: false,
      ms: Date.now() - t0,
    };
  }
}

// ─────────────────────────────────── defaults detection ─────────────────────

async function guessDefaults(cwd: string) {
  const defs = {
    benchmarkCommand: "python -m pytest",
    metricRegex: String.raw`metric:\s*([0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)`,
    direction: "maximize" as ArConfig["direction"],
    timeoutSeconds: 600,
  };
  try {
    const hasTrain = await exists(path.join(cwd, "train.py"));
    const hasPrep = await exists(path.join(cwd, "prepare.py"));
    const readme = (await exists(path.join(cwd, "README.md")))
      ? await fs.readFile(path.join(cwd, "README.md"), "utf8")
      : "";
    if (hasTrain && hasPrep && readme.toLowerCase().includes("autoresearch")) {
      defs.benchmarkCommand = "uv run train.py";
      defs.metricRegex = String.raw`^val_bpb:\s*([0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)`;
      defs.direction = "minimize";
    }
  } catch {}
  return defs;
}

// ─────────────────────────────────── status / widget ────────────────────────

function refreshStatus(
  ctx: ExtensionContext,
  cfg: ArConfig | null,
  runs: ArRun[],
) {
  if (!ctx.hasUI) return;
  if (!cfg) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  const total = runs.length;
  const kept = runs.filter((r) => r.status === "keep" || r.status === "baseline").length;
  const crashed = runs.filter((r) => r.status === "crash").length;
  const best = bestKept(runs, cfg.direction);
  const bestStr = best ? fmtScore(best.score) : "–";

  const t = ctx.ui.theme;
  const parts = [
    t.fg("accent", `${total} runs`),
    t.fg("success", `${kept} kept`),
    crashed > 0 ? t.fg("error", `${crashed} crashed`) : "",
    t.bold(t.fg("text", `best: ${bestStr}`)),
  ]
    .filter(Boolean)
    .join(" ");

  ctx.ui.setStatus(STATUS_KEY, `${t.fg("accent", "⚗")} autoresearch ${parts}`);
}

async function refreshAll(ctx: ExtensionContext) {
  const cfg = await loadConfig(ctx.cwd);
  const runs = cfg ? await loadRuns(ctx.cwd) : [];
  refreshStatus(ctx, cfg, runs);
}

// ──────────────────────────────── dashboard overlay ─────────────────────────

async function showDashboard(ctx: ExtensionContext, cfg: ArConfig, runs: ArRun[]) {
  if (!ctx.hasUI) return;

  await ctx.ui.custom<void>(
    (tui, theme, _kb, done) => {
      let cachedLines: string[] | undefined;

      function render(width: number) {
        if (cachedLines) return cachedLines;
        const lines: string[] = [];
        const add = (l: string) => lines.push(truncateToWidth(l, width));

        const bar = theme.fg("accent", "─".repeat(width));
        add(bar);
        add(` ${theme.fg("accent", theme.bold("⚗ autoresearch"))}`);
        add("");

        // summary stats
        const total = runs.length;
        const kept = runs.filter((r) => r.status === "keep" || r.status === "baseline").length;
        const discarded = runs.filter((r) => r.status === "discard").length;
        const crashed = runs.filter((r) => r.status === "crash").length;
        const best = bestKept(runs, cfg.direction);

        add(
          ` Total: ${theme.fg("text", String(total))}` +
            `  ${theme.fg("success", `${kept} kept`)}` +
            `  ${theme.fg("warning", `${discarded} discarded`)}` +
            `  ${theme.fg("error", `${crashed} crashed`)}`,
        );
        add(
          ` Best: ${best ? theme.bold(theme.fg("text", fmtScore(best.score))) : theme.fg("muted", "–")}`,
        );
        add("");

        // table header
        const hdr = [
          pad("#", 4),
          pad("commit", 10),
          pad("metric", 12),
          pad("status", 10),
          "description",
        ].join("");
        add(` ${theme.fg("muted", hdr)}`);
        add("");

        // table rows
        for (const run of runs) {
          const statusColor =
            run.status === "keep" || run.status === "baseline"
              ? "success"
              : run.status === "discard"
                ? "warning"
                : "error";
          const row = [
            pad(String(run.iteration), 4),
            pad(run.commit, 10),
            pad(fmtScore(run.score), 12),
            theme.fg(statusColor, pad(run.status, 10)),
            run.description,
          ].join("");
          add(` ${row}`);
        }

        if (!runs.length) {
          add(` ${theme.fg("muted", "No runs yet.")}`);
        }

        add("");
        add(` ${theme.fg("dim", "Press Escape to close")}`);
        add(bar);

        cachedLines = lines;
        return lines;
      }

      return {
        render,
        invalidate() {
          cachedLines = undefined;
        },
        handleInput(data: string) {
          if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || data === "q") {
            done(undefined);
          }
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center" as const,
        width: "90%",
        minWidth: 60,
        maxHeight: "85%",
        margin: 1,
      },
    },
  );
}

function pad(s: string, w: number) {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

// ─────────────────────────────── core iteration logic ───────────────────────

async function runIteration(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  cwd: string,
  input: ArLoopInput,
): Promise<{ text: string; details: Record<string, unknown>; isError?: boolean }> {
  const cfg = await loadConfig(cwd);
  if (!cfg) {
    return {
      text: "autoresearch is not configured. Run /autoresearch to set up a session first.",
      details: { error: "not_configured" },
      isError: true,
    };
  }

  const runs = await loadRuns(cwd);
  const iter = nextIter(runs);
  const { action, label } = input;
  const isBaseline = action === "benchmark";

  // For iterate: require git + dirty tree
  if (!isBaseline) {
    if (!(await isGitRepo(pi, cwd))) {
      return {
        text: "iterate requires a git repo (need commit/revert). Use action=benchmark to just measure.",
        details: { error: "not_git" },
        isError: true,
      };
    }
    if (!(await hasStagedOrTrackedChanges(pi, cwd))) {
      return {
        text: "Working tree is clean — nothing to test. Edit code first, then call ar_loop again.",
        details: { error: "clean_tree" },
        isError: true,
      };
    }
  }

  const startCommit = (await isGitRepo(pi, cwd)) ? await shortHead(pi, cwd) : null;

  // Run benchmark
  const bench = await runBenchmark(pi, cwd, cfg.benchmarkCommand, cfg.timeoutSeconds);
  const score = parseScore(bench.output, cfg.metricRegex);
  const crashed = bench.code !== 0 || bench.killed;

  // Decide outcome
  let status: ArStatus;
  if (isBaseline) {
    status = "baseline";
  } else if (crashed || score === null) {
    status = "crash";
    if (startCommit) await git(pi, cwd, ["reset", "--hard", startCommit]);
  } else if (improved(cfg, score, runs)) {
    // commit the improvement
    await git(pi, cwd, ["add", "-A"]);
    await git(pi, cwd, ["restore", "--staged", "--", AR_DIR]);
    const cm = await git(pi, cwd, ["commit", "-m", `ar: ${label}`]);
    if (cm.code !== 0) {
      status = "discard";
      if (startCommit) await git(pi, cwd, ["reset", "--hard", startCommit]);
    } else {
      status = "keep";
    }
  } else {
    status = "discard";
    if (startCommit) await git(pi, cwd, ["reset", "--hard", startCommit]);
  }

  const commit =
    status === "keep"
      ? (await shortHead(pi, cwd)) ?? "?"
      : startCommit ?? "-";

  const run: ArRun = {
    iteration: iter,
    commit,
    score,
    status,
    description: label,
    timestamp: new Date().toISOString(),
  };
  await appendRun(cwd, run);

  const updatedRuns = [...runs, run];
  refreshStatus(ctx, cfg, updatedRuns);

  // Build response
  const best = bestKept(updatedRuns, cfg.direction);
  const tail = bench.output.split(/\r?\n/).filter(Boolean).slice(-8).join("\n");

  const summary = [
    `## ar_loop result`,
    `- **iteration**: ${iter}`,
    `- **action**: ${action}`,
    `- **status**: ${status}`,
    `- **score**: ${fmtScore(score)}`,
    `- **best so far**: ${best ? fmtScore(best.score) : "–"}`,
    `- **commit**: ${commit}`,
    `- **duration**: ${(bench.ms / 1000).toFixed(1)}s`,
    crashed ? `- **crashed/killed**: yes` : "",
    `\n### output (tail)\n\`\`\`\n${tail}\n\`\`\``,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text: summary,
    details: { status, score, iteration: iter, commit, durationMs: bench.ms },
  };
}

// ─────────────────────────────── extension entry ────────────────────────────

export default function autoresearch(pi: ExtensionAPI) {
  // ── /autoresearch command ──────────────────────────────────────────────

  pi.registerCommand("autoresearch", {
    description: "Set up, view, or clear an autoresearch session",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/autoresearch needs interactive mode", "warning");
        return;
      }
      const sub = (args ?? "").trim().toLowerCase().split(/\s+/)[0] || "";

      // ── /autoresearch status | /autoresearch (when configured)
      if (sub === "status" || sub === "dashboard") {
        const cfg = await loadConfig(ctx.cwd);
        if (!cfg) {
          ctx.ui.notify("No autoresearch session. Run /autoresearch to create one.", "warning");
          return;
        }
        const runs = await loadRuns(ctx.cwd);
        await showDashboard(ctx, cfg, runs);
        return;
      }

      // ── /autoresearch clear
      if (sub === "clear") {
        const ok = await ctx.ui.confirm(
          "Clear autoresearch?",
          "Removes .autoresearch/ config and history. Code changes are not reverted.",
        );
        if (!ok) return;
        await fs.rm(arDir(ctx.cwd), { recursive: true, force: true });
        ctx.ui.setStatus(STATUS_KEY, undefined);
        ctx.ui.notify("autoresearch session cleared.", "info");
        return;
      }

      // ── /autoresearch (setup wizard)
      const existing = await loadConfig(ctx.cwd);
      if (existing && sub !== "setup") {
        // Already configured → show dashboard by default
        const runs = await loadRuns(ctx.cwd);
        await showDashboard(ctx, existing, runs);
        return;
      }
      if (existing) {
        const ok = await ctx.ui.confirm(
          "Overwrite existing autoresearch session?",
          "Current config and history will be replaced.",
        );
        if (!ok) return;
      }

      const defs = await guessDefaults(ctx.cwd);

      const objective = await ctx.ui.editor(
        "What should this autoresearch loop optimize? (high-level goal)",
        "Improve model quality",
      );
      if (!objective?.trim()) {
        ctx.ui.notify("Cancelled.", "warning");
        return;
      }

      const benchmarkCommand =
        (await ctx.ui.input("Benchmark command", defs.benchmarkCommand))?.trim() ||
        defs.benchmarkCommand;
      if (!benchmarkCommand) return;

      const metricRegex =
        (await ctx.ui.input(
          "Metric regex (capture group 1 = numeric score)",
          defs.metricRegex,
        ))?.trim() || defs.metricRegex;
      try {
        new RegExp(metricRegex, "m");
      } catch {
        ctx.ui.notify("Invalid regex. Aborting.", "error");
        return;
      }

      const dirChoice = await ctx.ui.select("Direction to optimize", [
        "Lower is better (minimize)",
        "Higher is better (maximize)",
      ]);
      if (!dirChoice) return;
      const direction: ArConfig["direction"] = dirChoice.includes("Higher")
        ? "maximize"
        : "minimize";

      const timeoutStr =
        (await ctx.ui.input("Benchmark timeout (seconds)", String(defs.timeoutSeconds)))?.trim() ||
        String(defs.timeoutSeconds);
      const timeoutSeconds = Math.max(10, parseInt(timeoutStr, 10) || defs.timeoutSeconds);

      const defaultBranch = `autoresearch/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
      const branch =
        (await ctx.ui.input("Git branch name", defaultBranch))?.trim() || defaultBranch;

      const cfg: ArConfig = {
        objective: objective.trim(),
        benchmarkCommand,
        metricRegex,
        direction,
        timeoutSeconds,
        branch,
        createdAt: new Date().toISOString(),
      };

      // Create branch if in git repo
      if (await isGitRepo(pi, ctx.cwd)) {
        const r = await git(pi, ctx.cwd, ["checkout", "-B", branch]);
        if (r.code !== 0) {
          const ok = await ctx.ui.confirm(
            "Branch switch failed",
            `${r.stderr}\nContinue without switching?`,
          );
          if (!ok) return;
        }
      }

      await saveConfig(ctx.cwd, cfg);
      // Reset log
      await fs.mkdir(arDir(ctx.cwd), { recursive: true });
      await fs.writeFile(logPath(ctx.cwd), TSV_HEADER + "\n");

      await refreshAll(ctx);
      ctx.ui.notify(
        [
          "autoresearch session ready ⚗",
          `  objective : ${cfg.objective}`,
          `  benchmark : ${cfg.benchmarkCommand}`,
          `  direction : ${dirLabel(cfg.direction)}`,
          `  branch    : ${cfg.branch}`,
          "",
          "Use ar_loop tool or /ar-step to iterate.",
        ].join("\n"),
        "info",
      );
    },
  });

  // ── /ar-step shortcut ─────────────────────────────────────────────────

  pi.registerCommand("ar-step", {
    description: "Run one autoresearch iteration (benchmark + keep/discard)",
    handler: async (args, ctx) => {
      const label = (args ?? "").trim() || "iteration";
      const res = await runIteration(pi, ctx, ctx.cwd, { action: "iterate", label });
      ctx.ui.notify(res.text, res.isError ? "error" : "info");
    },
  });

  pi.registerCommand("ar-baseline", {
    description: "Run autoresearch benchmark only (record baseline, no revert)",
    handler: async (args, ctx) => {
      const label = (args ?? "").trim() || "baseline";
      const res = await runIteration(pi, ctx, ctx.cwd, { action: "benchmark", label });
      ctx.ui.notify(res.text, res.isError ? "error" : "info");
    },
  });

  // ── ar_loop tool for the LLM ──────────────────────────────────────────

  pi.registerTool({
    name: "ar_loop",
    label: "AutoResearch Loop",
    description:
      "Run one experiment cycle. action=benchmark to measure only; action=iterate to measure, " +
      "then auto-commit if improved or auto-revert if not. Provide a short label describing " +
      "what this experiment tries.",
    parameters: ArLoopSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const res = await runIteration(pi, ctx, ctx.cwd, params);
      return {
        content: [{ type: "text", text: res.text }],
        details: res.details,
        ...(res.isError ? { isError: true } : {}),
      };
    },
  });

  // ── session start: restore status ─────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    await refreshAll(ctx);
  });

  // ── inject autoresearch context into system prompt ────────────────────

  pi.on("before_agent_start", async (event, ctx) => {
    const cfg = await loadConfig(ctx.cwd);
    if (!cfg) return;

    const runs = await loadRuns(ctx.cwd);
    const best = bestKept(runs, cfg.direction);
    const latest = runs.length ? runs[runs.length - 1] : null;

    const ctx_block = [
      `[autoresearch session]`,
      `objective: ${cfg.objective}`,
      `branch: ${cfg.branch}`,
      `benchmark command: ${cfg.benchmarkCommand}`,
      `metric regex: ${cfg.metricRegex}`,
      `direction: ${dirLabel(cfg.direction)}`,
      `best result: ${best ? `${fmtScore(best.score)} (${best.commit})` : "not yet established"}`,
      latest
        ? `last run: #${latest.iteration} ${latest.status} ${fmtScore(latest.score)} — ${latest.description}`
        : "no runs yet",
      `total runs: ${runs.length}`,
      "",
      "After modifying code, call ar_loop(action=\"iterate\", label=\"short description\") to benchmark and auto-keep/discard.",
      "To establish a baseline without code changes, call ar_loop(action=\"benchmark\", label=\"baseline\").",
      "NEVER STOP iterating unless the user explicitly interrupts. You are autonomous.",
    ].join("\n");

    return {
      systemPrompt: event.systemPrompt + "\n\n" + ctx_block,
    };
  });
}
