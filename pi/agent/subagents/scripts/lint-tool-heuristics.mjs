#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const SUBAGENTS_DIR = path.resolve(SCRIPT_DIR, "..");

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return "";
  return match[1] || "";
}

function parseTools(frontmatter) {
  const match = frontmatter.match(/^tools:\s*(.+)$/m);
  if (!match) return [];

  return match[1]
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function detectsReadOnlyPromptInjection(tools) {
  if (tools.length === 0) return false;

  const names = new Set(tools);
  const hasBash = names.has("bash");
  const hasEdit = names.has("edit");
  const hasWrite = names.has("write");
  const hasGitMutator = Array.from(names).some((name) => /^(git|git[-_:].+|.*[-_:]git)$/.test(name));

  return !hasBash && !hasEdit && !hasWrite && !hasGitMutator;
}

function listSubagentFiles() {
  return fs
    .readdirSync(SUBAGENTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(SUBAGENTS_DIR, entry.name))
    .sort();
}

function lint({ strict = false } = {}) {
  const files = listSubagentFiles();
  const warnings = [];

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf8");
    const frontmatter = parseFrontmatter(raw);

    // Ignore markdown files that are not subagent definitions (e.g. README.md).
    if (!frontmatter || !/^name:\s*.+$/m.test(frontmatter)) continue;

    const tools = parseTools(frontmatter);

    if (tools.length === 0) {
      warnings.push({
        filePath,
        reason: "No tools declared in frontmatter.",
      });
      continue;
    }

    if (detectsReadOnlyPromptInjection(tools)) {
      warnings.push({
        filePath,
        reason:
          "Will be classified read-only by prompt-composer heuristic (no bash/edit/write/git* tool detected).",
        tools,
      });
    }
  }

  if (warnings.length === 0) {
    console.log(`✅ No heuristic tool-profile issues detected across ${files.length} subagents.`);
    return 0;
  }

  console.log(`⚠ Found ${warnings.length} potential tool-profile issue(s):`);
  for (const warning of warnings) {
    const rel = path.relative(process.cwd(), warning.filePath);
    console.log(`- ${rel}`);
    console.log(`  ${warning.reason}`);
    if (warning.tools) console.log(`  tools: ${warning.tools.join(", ")}`);
  }

  console.log("\nTip: if this is intentional, no action needed. Otherwise adjust tools or prompt-composer heuristic.");
  return strict ? 1 : 0;
}

const strict = process.argv.includes("--strict");
process.exit(lint({ strict }));
