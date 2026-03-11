import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { completeSimple } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ── Types ────────────────────────────────────────────────────────────────────

type FragmentSelection = {
  relativePath: string;
  reason: string;
};

type DetectionContext = {
  cwd: string;
  platform: NodeJS.Platform;
  activeTools: string[];
  prompt: string;
};

type FragmentEntry = {
  relativePath: string;
  description: string;
  trigger:
    | { type: "always" }
    | { type: "detect"; detect: (ctx: DetectionContext) => boolean }
    | { type: "classify" };
};

type Composition = {
  cwd: string;
  platform: NodeJS.Platform;
  activeTools: string[];
  selected: FragmentSelection[];
  consideredCount: number;
  truncated: boolean;
  injectedChars: number;
  classifierUsed: boolean;
  classifierMs: number;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_INJECTED_CHARS = 20_000;
const FRAGMENT_CACHE = new Map<string, string>();
const CLASSIFIER_MODEL_CANDIDATES = [
  { provider: "anthropic", id: "claude-haiku-4-5" },
  { provider: "anthropic", id: "claude-3-5-haiku-latest" },
  { provider: "anthropic", id: "claude-3-5-haiku-20241022" },
];

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const fragmentsRoot = path.join(extensionDir, "..", "..", "system-fragments");

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasAnyFile(cwd: string, names: string[]): boolean {
  return names.some((name) => fs.existsSync(path.join(cwd, name)));
}

function loadPackageJson(cwd: string): Record<string, unknown> | null {
  const p = path.join(cwd, "package.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasDependency(pkg: Record<string, unknown>, name: string): boolean {
  const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  return fields.some((f) => {
    const bucket = pkg[f];
    if (!bucket || typeof bucket !== "object") return false;
    return Object.prototype.hasOwnProperty.call(bucket, name);
  });
}

function detectReadOnlyMode(activeTools: string[]): boolean {
  if (activeTools.length === 0) return false;
  const names = new Set(activeTools.map((t) => t.trim().toLowerCase()));
  const hasBash = names.has("bash");
  const hasEdit = names.has("edit");
  const hasWrite = names.has("write");
  const hasGitMutator = Array.from(names).some((n) => /^(git|git[-_:].+|.*[-_:]git)$/.test(n));
  return !hasBash && !hasEdit && !hasWrite && !hasGitMutator;
}

// ── Fragment manifest ────────────────────────────────────────────────────────
//
// Each fragment has a trigger type:
//   - "always": included on every turn (core guidance)
//   - "detect": included when a static heuristic matches (cwd files, platform, tools)
//   - "classify": included when a lightweight Haiku model determines relevance
//
// The classifier receives the description field for each "classify" fragment
// and the user's prompt, then selects which fragments to inject.

const FRAGMENT_MANIFEST: FragmentEntry[] = [
  // ── Always-on ──────────────────────────────────────────────────────────
  {
    relativePath: "base/core.md",
    description: "Core coding workflow guidance",
    trigger: { type: "always" },
  },
  {
    relativePath: "base/tool-usage.md",
    description: "Tool selection policy",
    trigger: { type: "always" },
  },
  {
    relativePath: "base/safety.md",
    description: "Safety and confirmation guidance",
    trigger: { type: "always" },
  },
  {
    relativePath: "tone/concise-output.md",
    description: "Concise, polished output without filler",
    trigger: { type: "always" },
  },
  {
    relativePath: "workflow/engineering-focus.md",
    description: "Interpret ambiguous requests as software engineering tasks",
    trigger: { type: "always" },
  },

  // ── Detect: platform ───────────────────────────────────────────────────
  {
    relativePath: "os/macos.md",
    description: "macOS-specific shell guidance",
    trigger: { type: "detect", detect: (ctx) => ctx.platform === "darwin" },
  },
  {
    relativePath: "os/linux.md",
    description: "Linux-specific shell guidance",
    trigger: { type: "detect", detect: (ctx) => ctx.platform === "linux" },
  },
  {
    relativePath: "os/windows.md",
    description: "Windows-specific shell guidance",
    trigger: { type: "detect", detect: (ctx) => ctx.platform === "win32" },
  },

  // ── Detect: repo ───────────────────────────────────────────────────────
  {
    relativePath: "repo/worktree.md",
    description: "Git worktree conventions",
    trigger: {
      type: "detect",
      detect: (ctx) => fs.existsSync(path.join(ctx.cwd, ".git")),
    },
  },
  {
    relativePath: "repo/git-ops.md",
    description: "Git commit and operation best practices",
    trigger: {
      type: "detect",
      detect: (ctx) => fs.existsSync(path.join(ctx.cwd, ".git")),
    },
  },

  // ── Detect: tools/mode ─────────────────────────────────────────────────
  {
    relativePath: "mode/read-only.md",
    description: "Read-only/planning mode guidance",
    trigger: {
      type: "detect",
      detect: (ctx) => detectReadOnlyMode(ctx.activeTools),
    },
  },

  // ── Detect: languages ──────────────────────────────────────────────────
  {
    relativePath: "lang/typescript.md",
    description: "TypeScript/Node project guidance",
    trigger: {
      type: "detect",
      detect: (ctx) => hasAnyFile(ctx.cwd, ["package.json", "tsconfig.json"]),
    },
  },
  {
    relativePath: "lang/ruby.md",
    description: "Ruby/Rails project guidance",
    trigger: {
      type: "detect",
      detect: (ctx) => hasAnyFile(ctx.cwd, ["Gemfile", ".ruby-version", "config/application.rb"]),
    },
  },
  {
    relativePath: "lang/go.md",
    description: "Go project guidance",
    trigger: {
      type: "detect",
      detect: (ctx) => hasAnyFile(ctx.cwd, ["go.mod"]),
    },
  },
  {
    relativePath: "lang/python.md",
    description: "Python project guidance",
    trigger: {
      type: "detect",
      detect: (ctx) =>
        hasAnyFile(ctx.cwd, [
          "pyproject.toml",
          "setup.py",
          "setup.cfg",
          "requirements.txt",
          "Pipfile",
          "poetry.lock",
          ".python-version",
        ]),
    },
  },
  {
    relativePath: "lang/rust.md",
    description: "Rust project guidance",
    trigger: {
      type: "detect",
      detect: (ctx) => hasAnyFile(ctx.cwd, ["Cargo.toml"]),
    },
  },
  {
    relativePath: "lang/nix.md",
    description: "Nix expression guidance",
    trigger: {
      type: "detect",
      detect: (ctx) => hasAnyFile(ctx.cwd, ["flake.nix", "default.nix", "shell.nix"]),
    },
  },
  {
    relativePath: "lang/frontend-aesthetics.md",
    description: "Frontend design and aesthetics guidance for UI/visual work",
    trigger: {
      type: "detect",
      detect: (ctx) => {
        // Check for frontend config files
        const configSignals = [
          "tailwind.config.ts",
          "tailwind.config.js",
          "postcss.config.js",
          "vite.config.ts",
          "vite.config.js",
          "next.config.ts",
          "next.config.js",
          "next.config.mjs",
          "nuxt.config.ts",
          "astro.config.ts",
          "astro.config.mjs",
        ];
        if (hasAnyFile(ctx.cwd, configSignals)) return true;

        // Check for frontend framework deps
        const pkg = loadPackageJson(ctx.cwd);
        if (pkg) {
          const frontendDeps = [
            "react",
            "next",
            "vue",
            "nuxt",
            "svelte",
            "@sveltejs/kit",
            "solid-js",
            "astro",
            "@angular/core",
            "preact",
          ];
          if (frontendDeps.some((dep) => hasDependency(pkg, dep))) return true;
        }

        return false;
      },
    },
  },

  // ── Classify: workflow (Haiku-selected based on prompt) ────────────────
  {
    relativePath: "workflow/ambitious-tasks.md",
    description: "User is attempting a large or complex task that spans many files or requires significant implementation work",
    trigger: { type: "classify" },
  },
  {
    relativePath: "workflow/avoid-over-engineering.md",
    description: "User wants a focused, minimal change — a bug fix, small feature, or targeted edit without scope creep",
    trigger: { type: "classify" },
  },
  {
    relativePath: "workflow/minimize-file-creation.md",
    description: "Task involves adding functionality where existing files could be extended rather than creating new ones",
    trigger: { type: "classify" },
  },
  {
    relativePath: "workflow/blocked-approach.md",
    description: "User is reporting that something isn't working, a previous approach failed, or they're stuck on an error",
    trigger: { type: "classify" },
  },
  {
    relativePath: "workflow/careful-actions.md",
    description: "Task involves potentially destructive, irreversible, or externally-visible operations (deleting, deploying, pushing, force operations)",
    trigger: { type: "classify" },
  },
  {
    relativePath: "tone/code-references.md",
    description: "User is asking about or discussing specific code locations, functions, or files and would benefit from precise file:line references",
    trigger: { type: "classify" },
  },
  {
    relativePath: "security/code-security.md",
    description: "Task involves writing code that handles user input, external data, authentication, authorization, or network operations",
    trigger: { type: "classify" },
  },
  {
    relativePath: "mode/debugging.md",
    description: "User is debugging, investigating an error, trying to understand why something doesn't work, or reporting a bug",
    trigger: { type: "classify" },
  },
  {
    relativePath: "mode/refactoring.md",
    description: "User is refactoring, restructuring, cleaning up, or reorganizing existing code without changing behavior",
    trigger: { type: "classify" },
  },
];

// ── Classifier ───────────────────────────────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT = `You are a prompt fragment classifier for a coding assistant. Given a user's message, select which additional guidance fragments should be injected into the assistant's system prompt to improve its response quality.

You will receive a list of available fragments, each with an ID and a description of when it should be activated. Select only fragments that are clearly relevant to the user's current request. Prefer precision over recall — it's better to miss a marginally relevant fragment than to include irrelevant ones.

Respond with a JSON array of fragment IDs. If no fragments are relevant, respond with [].

Example response: ["workflow/avoid-over-engineering.md", "mode/debugging.md"]`;

async function classifyPrompt(
  prompt: string,
  classifyFragments: FragmentEntry[],
  ctx: ExtensionContext,
): Promise<string[]> {
  if (classifyFragments.length === 0) return [];

  // Find a suitable classifier model
  const model = CLASSIFIER_MODEL_CANDIDATES.reduce<ReturnType<typeof ctx.modelRegistry.find>>(
    (found, candidate) => found ?? ctx.modelRegistry.find(candidate.provider, candidate.id),
    undefined,
  );

  if (!model) {
    // Fallback: no classifier model available, skip classification
    return [];
  }

  const apiKey = await ctx.modelRegistry.getApiKey(model);
  if (!apiKey) return [];

  const fragmentList = classifyFragments
    .map((f) => `- ${f.relativePath}: "${f.description}"`)
    .join("\n");

  const userMessage = `Available fragments:\n${fragmentList}\n\nUser message:\n${prompt}`;

  try {
    const result = await completeSimple(model, {
      systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage, timestamp: Date.now() }],
    }, {
      apiKey,
      maxTokens: 256,
      temperature: 0,
    });

    // Extract text content from the response
    const text = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    // Parse JSON array from response (handle markdown code fences)
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    // Validate that returned IDs are in our manifest
    const validIds = new Set(classifyFragments.map((f) => f.relativePath));
    return parsed.filter((id: unknown) => typeof id === "string" && validIds.has(id));
  } catch (err) {
    // Classification failure is non-fatal; fall back to no classification
    return [];
  }
}

// ── Fragment loading ─────────────────────────────────────────────────────────

async function loadFragment(relativePath: string): Promise<string | undefined> {
  if (FRAGMENT_CACHE.has(relativePath)) {
    return FRAGMENT_CACHE.get(relativePath);
  }

  const fullPath = path.join(fragmentsRoot, relativePath);
  try {
    const content = await fs.promises.readFile(fullPath, "utf8");
    const normalized = content.trim();
    FRAGMENT_CACHE.set(relativePath, normalized);
    return normalized;
  } catch {
    return undefined;
  }
}

// ── Composition ──────────────────────────────────────────────────────────────

async function collectSelections(
  dctx: DetectionContext,
  ctx: ExtensionContext,
): Promise<{ selections: FragmentSelection[]; classifierUsed: boolean; classifierMs: number }> {
  const selections: FragmentSelection[] = [];
  let classifierUsed = false;
  let classifierMs = 0;

  // 1. Collect "always" and "detect" fragments
  for (const entry of FRAGMENT_MANIFEST) {
    if (entry.trigger.type === "always") {
      selections.push({ relativePath: entry.relativePath, reason: entry.description });
    } else if (entry.trigger.type === "detect" && entry.trigger.detect(dctx)) {
      selections.push({ relativePath: entry.relativePath, reason: entry.description });
    }
  }

  // 2. Run classifier for "classify" fragments
  const classifyFragments = FRAGMENT_MANIFEST.filter((e) => e.trigger.type === "classify");
  if (classifyFragments.length > 0 && dctx.prompt.trim().length > 0) {
    const t0 = performance.now();
    const classifiedIds = await classifyPrompt(dctx.prompt, classifyFragments, ctx);
    classifierMs = Math.round(performance.now() - t0);
    classifierUsed = true;

    for (const id of classifiedIds) {
      const entry = classifyFragments.find((f) => f.relativePath === id);
      if (entry) {
        selections.push({
          relativePath: entry.relativePath,
          reason: `Classifier: ${entry.description}`,
        });
      }
    }
  }

  return { selections, classifierUsed, classifierMs };
}

async function composeRuntimePrompt(
  dctx: DetectionContext,
  ctx: ExtensionContext,
): Promise<{ text: string; composition: Composition }> {
  const { selections: considered, classifierUsed, classifierMs } = await collectSelections(dctx, ctx);
  const selected: FragmentSelection[] = [];
  const blocks: string[] = [];

  let currentChars = 0;
  let truncated = false;

  for (const candidate of considered) {
    const fragment = await loadFragment(candidate.relativePath);
    if (!fragment) continue;

    const block = `### ${candidate.relativePath}\n${fragment}`;
    const nextChars = currentChars + block.length;

    if (nextChars > MAX_INJECTED_CHARS) {
      truncated = true;
      break;
    }

    blocks.push(block);
    selected.push(candidate);
    currentChars = nextChars;
  }

  const intro = "## Runtime guidance (composed)";
  const body = blocks.join("\n\n");
  const truncationNote = truncated
    ? "\n\n_Note: additional fragments were available but omitted to control prompt size._"
    : "";

  const text = blocks.length > 0 ? `${intro}\n\n${body}${truncationNote}` : "";

  return {
    text,
    composition: {
      cwd: dctx.cwd,
      platform: dctx.platform,
      activeTools: dctx.activeTools,
      selected,
      consideredCount: FRAGMENT_MANIFEST.length,
      truncated,
      injectedChars: currentChars,
      classifierUsed,
      classifierMs,
    },
  };
}

// ── Debug formatting ─────────────────────────────────────────────────────────

function formatCompositionSummary(c: Composition): string[] {
  const lines = [
    `cwd: ${c.cwd}`,
    `platform: ${c.platform}`,
    `active tools: ${c.activeTools.join(", ") || "(none)"}`,
    `fragments considered: ${c.consideredCount}`,
    `fragments injected: ${c.selected.length}`,
    `prompt chars injected: ${c.injectedChars}`,
    `truncated: ${c.truncated ? "yes" : "no"}`,
  ];

  if (c.classifierUsed) {
    const classifiedCount = c.selected.filter((s) => s.reason.startsWith("Classifier:")).length;
    lines.push(`classifier: ${classifiedCount} fragments selected (${c.classifierMs}ms)`);
  } else {
    lines.push("classifier: not used");
  }

  return lines;
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function promptComposer(pi: ExtensionAPI) {
  let lastComposition: Composition | null = null;

  pi.registerCommand("prompt-debug", {
    description: "Show active prompt-composer fragments for the current repo/tool mode",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      if (!lastComposition) {
        ctx.ui.notify("prompt-composer: no composition has been generated yet in this session.", "warning");
        return;
      }

      const showFull = (args ?? "").trim().toLowerCase() === "full";
      const lines = ["prompt-composer", ...formatCompositionSummary(lastComposition), "", "selected fragments:"];

      if (lastComposition.selected.length === 0) {
        lines.push("- (none)");
      } else {
        for (const selection of lastComposition.selected) {
          lines.push(`- ${selection.relativePath}: ${selection.reason}`);
          if (showFull) {
            const content = FRAGMENT_CACHE.get(selection.relativePath) ?? "(not loaded)";
            lines.push(`  ${content.replace(/\n/g, "\n  ")}`);
          }
        }
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const activeTools = pi.getActiveTools();
    const dctx: DetectionContext = {
      cwd: ctx.cwd,
      platform: process.platform,
      activeTools,
      prompt: event.prompt,
    };

    const result = await composeRuntimePrompt(dctx, ctx);
    lastComposition = result.composition;

    if (ctx.hasUI) {
      const classifierNote = result.composition.classifierUsed
        ? ` (${result.composition.classifierMs}ms)`
        : "";
      ctx.ui.setStatus(
        "prompt-composer",
        `🧩${result.composition.selected.length}/${result.composition.consideredCount}${classifierNote}`,
      );
    }

    if (!result.text) {
      return;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${result.text}`,
    };
  });
}
