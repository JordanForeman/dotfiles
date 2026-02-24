import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFrontmatter } from "@mariozechner/pi-coding-agent";

export type SubagentScope = "user" | "project" | "both";
export type SubagentSource = "user" | "project";

export interface SubagentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
  provider?: string;
  model?: string;
  tags?: string[];
  source: SubagentSource;
  filePath: string;
  metadata: Record<string, unknown>;
}

export interface SubagentDiscoveryResult {
  subagents: SubagentDefinition[];
  userDirs: string[];
  projectDirs: string[];
  projectRoot: string | null;
  diagnostics: string[];
}

const USER_SUBAGENT_DIR = path.join(os.homedir(), ".pi", "agent", "subagents");

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === "string" ? item.trim() : String(item).trim()))
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  if (typeof value === "string") {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  return undefined;
}

function loadSubagentsFromDir(
  dir: string,
  source: SubagentSource
): { subagents: SubagentDefinition[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const subagents: SubagentDefinition[] = [];

  if (!isDirectory(dir)) return { subagents, diagnostics };

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    diagnostics.push(`Failed to read ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    return { subagents, diagnostics };
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let raw = "";

    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      diagnostics.push(`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw);

    const nameRaw = frontmatter.name;
    const descriptionRaw = frontmatter.description;

    const name =
      typeof nameRaw === "string" && nameRaw.trim().length > 0
        ? nameRaw.trim()
        : entry.name.replace(/\.md$/i, "");

    const description =
      typeof descriptionRaw === "string" && descriptionRaw.trim().length > 0
        ? descriptionRaw.trim()
        : `Subagent defined in ${entry.name}`;

    const tools = toStringArray(frontmatter.tools);
    const tags = toStringArray(frontmatter.tags);
    const provider = typeof frontmatter.provider === "string" ? frontmatter.provider.trim() : undefined;
    const model = typeof frontmatter.model === "string" ? frontmatter.model.trim() : undefined;

    if (!body.trim()) {
      diagnostics.push(`Skipped ${filePath}: missing system prompt body.`);
      continue;
    }

    subagents.push({
      name,
      description,
      systemPrompt: body.trim(),
      tools,
      provider: provider || undefined,
      model: model || undefined,
      tags,
      source,
      filePath,
      metadata: frontmatter,
    });
  }

  return { subagents, diagnostics };
}

function findNearestProjectSubagentDir(cwd: string): { root: string | null; dir: string | null } {
  let current = path.resolve(cwd);

  while (true) {
    const subagentDir = path.join(current, ".pi", "agent", "subagents");
    if (isDirectory(subagentDir)) {
      return { root: current, dir: subagentDir };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return { root: null, dir: null };
    }

    current = parent;
  }
}

export function getUserSubagentDir(): string {
  return USER_SUBAGENT_DIR;
}

export function discoverSubagents(cwd: string, scope: SubagentScope): SubagentDiscoveryResult {
  const diagnostics: string[] = [];
  const map = new Map<string, SubagentDefinition>();

  const project = findNearestProjectSubagentDir(cwd);

  const userDirs = scope === "project" ? [] : [USER_SUBAGENT_DIR];
  const projectDirs = scope === "user" ? [] : [project.dir].filter((dir): dir is string => Boolean(dir));

  const merge = (items: SubagentDefinition[]) => {
    for (const item of items) {
      const existing = map.get(item.name);
      if (existing) {
        diagnostics.push(`Subagent "${item.name}" from ${item.filePath} overrides ${existing.filePath}.`);
      }
      map.set(item.name, item);
    }
  };

  for (const dir of userDirs) {
    const loaded = loadSubagentsFromDir(dir, "user");
    diagnostics.push(...loaded.diagnostics);
    merge(loaded.subagents);
  }

  for (const dir of projectDirs) {
    const loaded = loadSubagentsFromDir(dir, "project");
    diagnostics.push(...loaded.diagnostics);
    merge(loaded.subagents);
  }

  const subagents = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  return {
    subagents,
    userDirs,
    projectDirs,
    projectRoot: project.root,
    diagnostics,
  };
}
