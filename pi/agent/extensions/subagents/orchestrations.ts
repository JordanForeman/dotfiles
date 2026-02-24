import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { SubagentScope } from "./registry.js";

export type OrchestrationSource = "user" | "project";

export const ORCHESTRATION_LIMITS = {
  maxStages: 12,
  maxParallelTasks: 8,
  maxConcurrency: 4,
} as const;

const ScopeSchema = Type.Union(
  [Type.Literal("user"), Type.Literal("project"), Type.Literal("both")],
  { default: "user" }
);

const OrchestrationTaskSchema = Type.Object(
  {
    subagent: Type.String({ minLength: 1 }),
    task: Type.String({ minLength: 1 }),
    relation: Type.Optional(Type.String()),
    cwd: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

const OrchestrationStageSchema = Type.Object(
  {
    label: Type.Optional(Type.String()),
    tasks: Type.Array(OrchestrationTaskSchema, {
      minItems: 1,
      maxItems: ORCHESTRATION_LIMITS.maxParallelTasks,
    }),
    relation: Type.Optional(Type.String()),
    concurrency: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: ORCHESTRATION_LIMITS.maxConcurrency,
      })
    ),
  },
  { additionalProperties: false }
);

const OrchestrationFileSchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    relation: Type.Optional(Type.String()),
    scope: Type.Optional(ScopeSchema),
    confirmProjectSubagents: Type.Optional(Type.Boolean()),
    cwd: Type.Optional(Type.String()),
    stages: Type.Array(OrchestrationStageSchema, {
      minItems: 1,
      maxItems: ORCHESTRATION_LIMITS.maxStages,
    }),
  },
  { additionalProperties: false }
);

export type OrchestrationTaskConfig = Static<typeof OrchestrationTaskSchema>;
export type OrchestrationStageConfig = Static<typeof OrchestrationStageSchema>;
type OrchestrationFileConfig = Static<typeof OrchestrationFileSchema>;

export interface OrchestrationConfigDefinition {
  name: string;
  description: string;
  relation?: string;
  scope?: SubagentScope;
  confirmProjectSubagents?: boolean;
  cwd?: string;
  stages: OrchestrationStageConfig[];
  source: OrchestrationSource;
  filePath: string;
  metadata: Record<string, unknown>;
}

export interface OrchestrationDiscoveryResult {
  orchestrations: OrchestrationConfigDefinition[];
  userDirs: string[];
  projectDirs: string[];
  projectRoot: string | null;
  diagnostics: string[];
}

const USER_ORCHESTRATION_DIR = path.join(os.homedir(), ".pi", "agent", "subagents", "orchestrations");

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function toScope(value: unknown): SubagentScope | undefined {
  if (value === "user" || value === "project" || value === "both") return value;
  return undefined;
}

function loadOrchestrationsFromDir(
  dir: string,
  source: OrchestrationSource
): { orchestrations: OrchestrationConfigDefinition[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const orchestrations: OrchestrationConfigDefinition[] = [];

  if (!isDirectory(dir)) return { orchestrations, diagnostics };

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    diagnostics.push(`Failed to read ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    return { orchestrations, diagnostics };
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".json")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let parsed: unknown;

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      parsed = JSON.parse(raw);
    } catch (error) {
      diagnostics.push(`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (!Value.Check(OrchestrationFileSchema, parsed)) {
      const issues = [...Value.Errors(OrchestrationFileSchema, parsed)]
        .slice(0, 3)
        .map((issue) => `${issue.path || "/"}: ${issue.message}`)
        .join("; ");
      diagnostics.push(`Skipped ${filePath}: invalid orchestration config (${issues}).`);
      continue;
    }

    const config = parsed as OrchestrationFileConfig;
    const name = config.name?.trim() || entry.name.replace(/\.json$/i, "");
    const description =
      config.description?.trim() || `Orchestration defined in ${entry.name}`;

    orchestrations.push({
      name,
      description,
      relation: config.relation?.trim() || undefined,
      scope: toScope(config.scope),
      confirmProjectSubagents: config.confirmProjectSubagents,
      cwd: config.cwd?.trim() || undefined,
      stages: config.stages,
      source,
      filePath,
      metadata: config as Record<string, unknown>,
    });
  }

  return { orchestrations, diagnostics };
}

function findNearestProjectOrchestrationDir(cwd: string): { root: string | null; dir: string | null } {
  let current = path.resolve(cwd);

  while (true) {
    const orchestrationDir = path.join(current, ".pi", "agent", "subagents", "orchestrations");
    if (isDirectory(orchestrationDir)) {
      return { root: current, dir: orchestrationDir };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return { root: null, dir: null };
    }

    current = parent;
  }
}

export function getUserOrchestrationDir(): string {
  return USER_ORCHESTRATION_DIR;
}

export function discoverOrchestrations(cwd: string, scope: SubagentScope): OrchestrationDiscoveryResult {
  const diagnostics: string[] = [];
  const map = new Map<string, OrchestrationConfigDefinition>();

  const project = findNearestProjectOrchestrationDir(cwd);

  const userDirs = scope === "project" ? [] : [USER_ORCHESTRATION_DIR];
  const projectDirs = scope === "user" ? [] : [project.dir].filter((dir): dir is string => Boolean(dir));

  const merge = (items: OrchestrationConfigDefinition[]) => {
    for (const item of items) {
      const existing = map.get(item.name);
      if (existing) {
        diagnostics.push(`Orchestration "${item.name}" from ${item.filePath} overrides ${existing.filePath}.`);
      }
      map.set(item.name, item);
    }
  };

  for (const dir of userDirs) {
    const loaded = loadOrchestrationsFromDir(dir, "user");
    diagnostics.push(...loaded.diagnostics);
    merge(loaded.orchestrations);
  }

  for (const dir of projectDirs) {
    const loaded = loadOrchestrationsFromDir(dir, "project");
    diagnostics.push(...loaded.diagnostics);
    merge(loaded.orchestrations);
  }

  const orchestrations = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  return {
    orchestrations,
    userDirs,
    projectDirs,
    projectRoot: project.root,
    diagnostics,
  };
}
