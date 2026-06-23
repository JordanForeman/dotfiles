import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { completeSimple } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { InterceptorExtensionCore } from "../../extension-core/interceptor-extension-core";

// ── Types ────────────────────────────────────────────────────────────────────

type InjectionType = "always" | "detect" | "classify" | "explicit";

type DetectRules = {
  files?: string[];
  platform?: string;
  dependencies?: string[];
  mode?: "read-only" | "write";
};

type SkillEntry = {
  /** Taxonomy category: conventions, guides, formats, standards */
  category: string;
  /** Skill name (matches directory name) */
  name: string;
  /** Human-readable description (classifier input for "classify" skills) */
  description: string;
  /** How the skill is delivered */
  injection: InjectionType;
  /** Detection rules (only for injection: detect) */
  detect?: DetectRules;
  /**
   * Relevance in [0,1]. Drives ordering when the injection budget is tight and
   * gates inclusion against a runtime relevanceFloor. Defaults are applied by
   * injection type when frontmatter omits it (see DEFAULT_PRIORITY).
   */
  priority: number;
  /** Relative path from skills root to the SKILL.md */
  relativePath: string;
};

type FragmentSelection = {
  relativePath: string;
  reason: string;
  priority: number;
};

type DetectionContext = {
  cwd: string;
  platform: NodeJS.Platform;
  activeTools: string[];
  prompt: string;
};

type Composition = {
  cwd: string;
  platform: NodeJS.Platform;
  activeTools: string[];
  selected: FragmentSelection[];
  consideredCount: number;
  truncated: boolean;
  /** Fragments dropped because their priority fell below the runtime relevanceFloor. */
  gatedByFloor: number;
  /** The relevanceFloor in effect for this composition (0 = no gating). */
  relevanceFloor: number;
  injectedChars: number;
  classifierUsed: boolean;
  classifierMs: number;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_INJECTED_CHARS = 20_000;

/**
 * Default relevance per injection type, applied when a SKILL.md omits an
 * explicit `priority`. always-on guidance is the floor of taste and outranks
 * everything; classifier-selected fragments are demonstrably relevant to *this*
 * prompt and rank just below; declarative detect matches sit lowest. Ordering,
 * not exclusion — every selected fragment still ships unless the budget or a
 * runtime floor forces a cut.
 */
const DEFAULT_PRIORITY: Record<InjectionType, number> = {
  always: 1.0,
  classify: 0.7,
  detect: 0.5,
  explicit: 0.5,
};
const CONTENT_CACHE = new Map<string, string>();
const CLASSIFIER_MODEL_CANDIDATES = [
  { provider: "anthropic", id: "claude-haiku-4-5" },
  { provider: "anthropic", id: "claude-3-5-haiku-latest" },
  { provider: "anthropic", id: "claude-3-5-haiku-20241022" },
];

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const skillsRoot = path.join(extensionDir, "..", "..", "skills");

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

function detectWriteMode(activeTools: string[]): boolean {
  if (activeTools.length === 0) return false;
  const names = new Set(activeTools.map((t) => t.trim().toLowerCase()));
  return names.has("bash") || names.has("edit") || names.has("write");
}

// ── SKILL.md frontmatter parsing ─────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const lines = match[1].split("\n");
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const line of lines) {
    // Nested key under detect:
    const indentedMatch = line.match(/^  (\w+):\s*(.*)/);
    if (indentedMatch && currentKey === "detect") {
      const nestedKey = indentedMatch[1];
      const value = indentedMatch[2].trim();
      if (!result.detect || typeof result.detect !== "object") {
        result.detect = {};
      }
      (result.detect as Record<string, unknown>)[nestedKey] = parseYamlValue(value);
      continue;
    }

    // Top-level key
    const topMatch = line.match(/^(\w+):\s*(.*)/);
    if (topMatch) {
      currentKey = topMatch[1];
      const value = topMatch[2].trim();
      if (value === "" || value === undefined) {
        // Object start (like "detect:")
        result[currentKey] = {};
      } else {
        result[currentKey] = parseYamlValue(value);
      }
    }
  }

  return result;
}

function parseYamlValue(raw: string): string | string[] {
  // Inline array: [a, b, c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1);
    return inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        // Strip quotes
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
          return s.slice(1, -1);
        }
        return s;
      });
  }
  // Quoted string
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

// ── Skill discovery ──────────────────────────────────────────────────────────

const SKILL_CATEGORIES = ["conventions", "guides", "formats", "standards"];

let discoveredSkills: SkillEntry[] | null = null;

function discoverSkills(): SkillEntry[] {
  if (discoveredSkills) return discoveredSkills;

  const entries: SkillEntry[] = [];

  for (const category of SKILL_CATEGORIES) {
    const categoryPath = path.join(skillsRoot, category);
    if (!fs.existsSync(categoryPath)) continue;

    const dirs = fs.readdirSync(categoryPath, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const skillMdPath = path.join(categoryPath, dir.name, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) continue;

      const content = fs.readFileSync(skillMdPath, "utf8");
      const frontmatter = parseFrontmatter(content);
      if (!frontmatter) continue;

      const injection = frontmatter.injection as InjectionType | undefined;
      if (!injection || injection === "explicit") continue; // Pi handles explicit skills natively

      const rawPriority = frontmatter.priority;
      const parsedPriority =
        typeof rawPriority === "string" ? Number.parseFloat(rawPriority) : Number.NaN;
      const priority =
        Number.isFinite(parsedPriority) && parsedPriority >= 0 && parsedPriority <= 1
          ? parsedPriority
          : DEFAULT_PRIORITY[injection];

      const entry: SkillEntry = {
        category,
        name: (frontmatter.name as string) ?? dir.name,
        description: (frontmatter.description as string) ?? "",
        injection,
        priority,
        relativePath: path.join(category, dir.name, "SKILL.md"),
      };

      if (injection === "detect" && frontmatter.detect && typeof frontmatter.detect === "object") {
        entry.detect = frontmatter.detect as DetectRules;
      }

      entries.push(entry);
    }
  }

  discoveredSkills = entries;
  return entries;
}

// ── Detection evaluation ─────────────────────────────────────────────────────

function evaluateDetection(entry: SkillEntry, ctx: DetectionContext): boolean {
  if (!entry.detect) return false;
  const rules = entry.detect;

  // Platform check
  if (rules.platform && ctx.platform === rules.platform) return true;

  // Mode check
  if (rules.mode === "read-only" && detectReadOnlyMode(ctx.activeTools)) return true;
  if (rules.mode === "write" && detectWriteMode(ctx.activeTools)) return true;

  // File existence check
  if (rules.files && rules.files.length > 0 && hasAnyFile(ctx.cwd, rules.files)) return true;

  // Dependency check
  if (rules.dependencies && rules.dependencies.length > 0) {
    const pkg = loadPackageJson(ctx.cwd);
    if (pkg && rules.dependencies.some((dep) => hasDependency(pkg, dep))) return true;
  }

  return false;
}

// ── Classifier ───────────────────────────────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT = `You are a prompt fragment classifier for a coding assistant. Given a user's message, select which additional guidance fragments should be injected into the assistant's system prompt to improve its response quality.

You will receive a list of available fragments, each with an ID and a description of when it should be activated. Select only fragments that are clearly relevant to the user's current request. Prefer precision over recall — it's better to miss a marginally relevant fragment than to include irrelevant ones.

Respond with a JSON array of fragment IDs. If no fragments are relevant, respond with [].

Example response: ["conventions/code-security/SKILL.md", "guides/debugging/SKILL.md"]`;

async function classifyPrompt(
  prompt: string,
  classifySkills: SkillEntry[],
  ctx: ExtensionContext,
): Promise<string[]> {
  if (classifySkills.length === 0) return [];

  const model = CLASSIFIER_MODEL_CANDIDATES.reduce<ReturnType<typeof ctx.modelRegistry.find>>(
    (found, candidate) => found ?? ctx.modelRegistry.find(candidate.provider, candidate.id),
    undefined,
  );

  if (!model) return [];

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) return [];

  const fragmentList = classifySkills
    .map((s) => `- ${s.relativePath}: "${s.description}"`)
    .join("\n");

  const userMessage = `Available fragments:\n${fragmentList}\n\nUser message:\n${prompt}`;

  try {
    const result = await completeSimple(model, {
      systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage, timestamp: Date.now() }],
    }, {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: 256,
      temperature: 0,
    });

    const text = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const validIds = new Set(classifySkills.map((s) => s.relativePath));
    return parsed.filter((id: unknown) => typeof id === "string" && validIds.has(id));
  } catch {
    return [];
  }
}

// ── Skill content loading ────────────────────────────────────────────────────

async function loadSkillContent(relativePath: string): Promise<string | undefined> {
  if (CONTENT_CACHE.has(relativePath)) {
    return CONTENT_CACHE.get(relativePath);
  }

  const fullPath = path.join(skillsRoot, relativePath);
  try {
    const raw = await fs.promises.readFile(fullPath, "utf8");
    // Strip frontmatter, return only the body
    const body = raw.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
    CONTENT_CACHE.set(relativePath, body);
    return body;
  } catch {
    return undefined;
  }
}

// ── Composition ──────────────────────────────────────────────────────────────

async function collectSelections(
  dctx: DetectionContext,
  ctx: ExtensionContext,
): Promise<{ selections: FragmentSelection[]; classifierUsed: boolean; classifierMs: number }> {
  const skills = discoverSkills();
  const selections: FragmentSelection[] = [];
  let classifierUsed = false;
  let classifierMs = 0;

  // 1. Always-on skills
  for (const skill of skills) {
    if (skill.injection === "always") {
      selections.push({
        relativePath: skill.relativePath,
        reason: skill.description,
        priority: skill.priority,
      });
    }
  }

  // 2. Detect skills — evaluate declarative rules
  for (const skill of skills) {
    if (skill.injection === "detect" && evaluateDetection(skill, dctx)) {
      selections.push({
        relativePath: skill.relativePath,
        reason: skill.description,
        priority: skill.priority,
      });
    }
  }

  // 3. Classify skills — LLM selection
  const classifySkills = skills.filter((s) => s.injection === "classify");
  if (classifySkills.length > 0 && dctx.prompt.trim().length > 0) {
    const t0 = performance.now();
    const classifiedIds = await classifyPrompt(dctx.prompt, classifySkills, ctx);
    classifierMs = Math.round(performance.now() - t0);
    classifierUsed = true;

    for (const id of classifiedIds) {
      const skill = classifySkills.find((s) => s.relativePath === id);
      if (skill) {
        selections.push({
          relativePath: skill.relativePath,
          reason: `Classifier: ${skill.description}`,
          priority: skill.priority,
        });
      }
    }
  }

  return { selections, classifierUsed, classifierMs };
}

async function composeRuntimePrompt(
  dctx: DetectionContext,
  ctx: ExtensionContext,
  relevanceFloor = 0,
): Promise<{ text: string; composition: Composition }> {
  const skills = discoverSkills();
  const { selections: collected, classifierUsed, classifierMs } = await collectSelections(dctx, ctx);

  // Intelligent projection, not mechanical: rank by relevance before spending
  // the budget so a high-priority classified skill can't lose its slot to an
  // earlier-discovered detect skill. The runtime relevanceFloor (fed by the
  // health monitor under context pressure) drops the least-relevant fragments
  // first — floor 0 is a no-op, preserving prior behavior.
  const ranked = [...collected].sort((a, b) => b.priority - a.priority);
  const gated = ranked.filter((s) => s.priority >= relevanceFloor);
  const gatedByFloor = ranked.length - gated.length;

  const selected: FragmentSelection[] = [];
  const blocks: string[] = [];

  let currentChars = 0;
  let truncated = false;

  for (const candidate of gated) {
    const content = await loadSkillContent(candidate.relativePath);
    if (!content) continue;

    const block = `### ${candidate.relativePath}\n${content}`;
    const nextChars = currentChars + block.length;

    if (nextChars > MAX_INJECTED_CHARS) {
      truncated = true;
      break;
    }

    blocks.push(block);
    selected.push(candidate);
    currentChars = nextChars;
  }

  const intro = "## Runtime guidance (composed from skills)";
  const body = blocks.join("\n\n");
  const truncationNote = truncated
    ? "\n\n_Note: additional skills were available but omitted to control prompt size._"
    : "";

  const text = blocks.length > 0 ? `${intro}\n\n${body}${truncationNote}` : "";

  return {
    text,
    composition: {
      cwd: dctx.cwd,
      platform: dctx.platform,
      activeTools: dctx.activeTools,
      selected,
      consideredCount: skills.length,
      truncated,
      gatedByFloor,
      relevanceFloor,
      injectedChars: currentChars,
      classifierUsed,
      classifierMs,
    },
  };
}

// ── Health-checkpoint seam ───────────────────────────────────────────────────

// The health monitor (context-threshold) publishes a `health-checkpoint` custom
// entry onto the session tree carrying the context-pressure-derived
// relevanceFloor. The two extensions never import each other; the tree is the
// shared seam. appendEntry state does NOT enter the LLM context, so this is a
// pure side-channel for composition decisions.
const HEALTH_CHECKPOINT_TYPE = "health-checkpoint";

function readRelevanceFloor(ctx: ExtensionContext): number {
  const sm = (ctx as { sessionManager?: { getEntries?: () => unknown[] } }).sessionManager;
  const entries = sm?.getEntries?.();
  if (!Array.isArray(entries)) return 0;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as { type?: string; customType?: string; data?: { relevanceFloor?: unknown } };
    if (entry?.type === "custom" && entry.customType === HEALTH_CHECKPOINT_TYPE) {
      const floor = entry.data?.relevanceFloor;
      if (typeof floor === "number" && floor >= 0 && floor <= 1) return floor;
      return 0;
    }
  }
  return 0;
}

// ── Debug formatting ─────────────────────────────────────────────────────────

function formatCompositionSummary(c: Composition): string[] {
  const lines = [
    `cwd: ${c.cwd}`,
    `platform: ${c.platform}`,
    `active tools: ${c.activeTools.join(", ") || "(none)"}`,
    `skills discovered: ${c.consideredCount}`,
    `skills injected: ${c.selected.length}`,
    `prompt chars injected: ${c.injectedChars}`,
    `truncated: ${c.truncated ? "yes" : "no"}`,
  ];

  if (c.relevanceFloor > 0) {
    lines.push(`relevance floor: ${c.relevanceFloor.toFixed(2)} (gated ${c.gatedByFloor})`);
  }

  if (c.classifierUsed) {
    const classifiedCount = c.selected.filter((s) => s.reason.startsWith("Classifier:")).length;
    lines.push(`classifier: ${classifiedCount} skills selected (${c.classifierMs}ms)`);
  } else {
    lines.push("classifier: not used");
  }

  return lines;
}

// ── Extension entry point ────────────────────────────────────────────────────

function registerPromptComposer(pi: ExtensionAPI) {
  let lastComposition: Composition | null = null;

  pi.registerCommand("prompt-debug", {
    description: "Show active prompt-composer skills for the current repo/tool mode",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      if (!lastComposition) {
        ctx.ui.notify("prompt-composer: no composition has been generated yet in this session.", "warning");
        return;
      }

      const showFull = (args ?? "").trim().toLowerCase() === "full";
      const lines = ["prompt-composer", ...formatCompositionSummary(lastComposition), "", "injected skills:"];

      if (lastComposition.selected.length === 0) {
        lines.push("- (none)");
      } else {
        for (const selection of lastComposition.selected) {
          lines.push(`- ${selection.relativePath}: ${selection.reason}`);
          if (showFull) {
            const content = CONTENT_CACHE.get(selection.relativePath) ?? "(not loaded)";
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

    const relevanceFloor = readRelevanceFloor(ctx);
    const result = await composeRuntimePrompt(dctx, ctx, relevanceFloor);
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

class PromptComposerExtension extends InterceptorExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "prompt-composer",
      name: "Prompt Composer",
      summary: "Composed runtime prompt from skills",
    });
  }

  protected registerExtension(): void {
    registerPromptComposer(this.pi);
  }
}

export default function promptComposer(pi: ExtensionAPI) {
  new PromptComposerExtension(pi).register();
}
