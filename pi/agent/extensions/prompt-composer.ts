import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type FragmentSelection = {
  relativePath: string;
  reason: string;
};

type Composition = {
  cwd: string;
  platform: NodeJS.Platform;
  activeTools: string[];
  selected: FragmentSelection[];
  truncated: boolean;
  injectedChars: number;
};

const MAX_INJECTED_CHARS = 12_000;
const FRAGMENT_CACHE = new Map<string, string>();

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const fragmentsRoot = path.join(extensionDir, "..", "system-fragments");

function hasAnyFile(cwd: string, names: string[]): boolean {
  return names.some((name) => fs.existsSync(path.join(cwd, name)));
}

function detectLanguageFragments(cwd: string): FragmentSelection[] {
  const selections: FragmentSelection[] = [];

  if (hasAnyFile(cwd, ["package.json", "tsconfig.json"])) {
    selections.push({
      relativePath: "lang/typescript.md",
      reason: "TypeScript/Node project signals detected",
    });
  }

  if (hasAnyFile(cwd, ["Gemfile", ".ruby-version", "config/application.rb"])) {
    selections.push({
      relativePath: "lang/ruby.md",
      reason: "Ruby/Rails project signals detected",
    });
  }

  if (hasAnyFile(cwd, ["go.mod"])) {
    selections.push({
      relativePath: "lang/go.md",
      reason: "Go module detected",
    });
  }

  return selections;
}

function detectOsFragment(platform: NodeJS.Platform): FragmentSelection | undefined {
  if (platform === "darwin") {
    return { relativePath: "os/macos.md", reason: "Host platform is macOS" };
  }

  if (platform === "linux") {
    return { relativePath: "os/linux.md", reason: "Host platform is Linux" };
  }

  if (platform === "win32") {
    return { relativePath: "os/windows.md", reason: "Host platform is Windows" };
  }

  return undefined;
}

function detectReadOnlyMode(activeTools: string[]): boolean {
  if (activeTools.length === 0) return false;
  const names = new Set(activeTools);
  return !names.has("edit") && !names.has("write");
}

function collectSelections(cwd: string, platform: NodeJS.Platform, activeTools: string[]): FragmentSelection[] {
  const selections: FragmentSelection[] = [
    {
      relativePath: "base/core.md",
      reason: "Always-on coding workflow guidance",
    },
    {
      relativePath: "base/tool-usage.md",
      reason: "Always-on tool selection policy",
    },
    {
      relativePath: "base/safety.md",
      reason: "Always-on safety and confirmation guidance",
    },
  ];

  const osFragment = detectOsFragment(platform);
  if (osFragment) selections.push(osFragment);

  if (fs.existsSync(path.join(cwd, ".git"))) {
    selections.push({
      relativePath: "repo/worktree.md",
      reason: "Repository context detected",
    });
  }

  if (detectReadOnlyMode(activeTools)) {
    selections.push({
      relativePath: "mode/read-only.md",
      reason: "Active tools indicate read-only/planning mode",
    });
  }

  selections.push(...detectLanguageFragments(cwd));

  return selections;
}

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

async function composeRuntimePrompt(cwd: string, platform: NodeJS.Platform, activeTools: string[]): Promise<{
  text: string;
  composition: Composition;
}> {
  const selections = collectSelections(cwd, platform, activeTools);
  const blocks: string[] = [];
  let currentChars = 0;
  let truncated = false;

  for (const selection of selections) {
    const fragment = await loadFragment(selection.relativePath);
    if (!fragment) continue;

    const block = `### ${selection.relativePath}\n${fragment}`;
    const nextChars = currentChars + block.length;

    if (nextChars > MAX_INJECTED_CHARS) {
      truncated = true;
      break;
    }

    blocks.push(block);
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
      cwd,
      platform,
      activeTools,
      selected: selections,
      truncated,
      injectedChars: currentChars,
    },
  };
}

export default function promptComposer(pi: ExtensionAPI) {
  let lastComposition: Composition | null = null;

  pi.on("before_agent_start", async (event, ctx) => {
    const activeTools = pi.getActiveTools();
    const result = await composeRuntimePrompt(ctx.cwd, process.platform, activeTools);
    lastComposition = result.composition;

    if (!result.text) {
      return;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${result.text}`,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (!lastComposition) return;

    ctx.ui.setStatus(
      "prompt-composer",
      `prompt-composer: ${lastComposition.selected.length} fragments (${lastComposition.injectedChars} chars)`
    );
  });
}
