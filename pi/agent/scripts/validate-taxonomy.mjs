#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const promptsRoot = path.join(repoRoot, "pi/agent/prompts");
const skillsRoot = path.join(repoRoot, "pi/agent/skills");
const extensionsRoot = path.join(repoRoot, "pi/agent/extensions");
const extensionCoreRoot = path.join(repoRoot, "pi/agent/extension-core");
const optionalExtensionsRoot = path.join(repoRoot, "pi/agent/optional-extensions");
const legacyPhilosophyRoot = path.join(repoRoot, "pi/agent/philosophy");

const PROMPT_CATEGORIES = ["guides", "conventions", "formats", "standards"];
const SKILL_CATEGORIES = ["guides", "conventions", "formats", "standards"];
const EXTENSION_BASE_CLASSES = [
  "GuardianExtensionCore",
  "InterceptorExtensionCore",
  "WorkflowExtensionCore",
  "WidgetExtensionCore",
  "IntegrationExtensionCore",
];

const errors = [];

function toPosix(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join(path.posix.sep);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(dirPath, entry.name));
}

async function listDirs(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(dirPath, entry.name));
}

function parseFrontmatterName(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const nameLine = match[1]
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("name:"));
  if (!nameLine) return null;
  const value = nameLine.replace(/^name:\s*/, "").trim();
  return value || null;
}

async function validateNoLegacyPhilosophy() {
  if (!(await pathExists(legacyPhilosophyRoot))) return;

  const entries = await fs.readdir(legacyPhilosophyRoot, { withFileTypes: true });
  if (entries.length > 0) {
    errors.push(
      `Legacy directory should not be used: ${toPosix(legacyPhilosophyRoot)} (move content to system-fragments, prompts, or skills taxonomy)`
    );
  }
}

async function validatePromptTaxonomy() {
  for (const category of PROMPT_CATEGORIES) {
    const categoryPath = path.join(promptsRoot, category);
    if (!(await pathExists(categoryPath))) {
      errors.push(`Missing prompt category directory: ${toPosix(categoryPath)}`);
    }
  }

  const promptRootFiles = (await listFiles(promptsRoot)).filter((file) => file.endsWith(".md"));
  for (const file of promptRootFiles) {
    errors.push(`Prompt file must be in a taxonomy category directory: ${toPosix(file)}`);
  }

  for (const category of PROMPT_CATEGORIES) {
    const categoryPath = path.join(promptsRoot, category);
    if (!(await pathExists(categoryPath))) continue;

    const files = await listFiles(categoryPath);
    for (const file of files) {
      const isMarkdown = file.endsWith(".md");
      const isGitkeep = path.basename(file) === ".gitkeep";
      if (!isMarkdown && !isGitkeep) {
        errors.push(`Unexpected non-markdown file in prompt category: ${toPosix(file)}`);
      }
    }

    const nestedDirs = await listDirs(categoryPath);
    for (const nestedDir of nestedDirs) {
      errors.push(`Prompt taxonomy is one-level only; move files out of nested dir: ${toPosix(nestedDir)}`);
    }
  }
}

async function validateSkillTaxonomy() {
  for (const category of SKILL_CATEGORIES) {
    const categoryPath = path.join(skillsRoot, category);
    if (!(await pathExists(categoryPath))) {
      errors.push(`Missing skill category directory: ${toPosix(categoryPath)}`);
    }
  }

  const skillRootDirs = await listDirs(skillsRoot);
  for (const dirPath of skillRootDirs) {
    const name = path.basename(dirPath);
    if (SKILL_CATEGORIES.includes(name)) continue;
    errors.push(`Skill directory must be under a taxonomy category: ${toPosix(dirPath)}`);
  }

  for (const category of SKILL_CATEGORIES) {
    const categoryPath = path.join(skillsRoot, category);
    if (!(await pathExists(categoryPath))) continue;

    const skillDirs = await listDirs(categoryPath);
    for (const skillDir of skillDirs) {
      const skillMd = path.join(skillDir, "SKILL.md");
      if (!(await pathExists(skillMd))) {
        errors.push(`Skill missing SKILL.md: ${toPosix(skillDir)}`);
        continue;
      }

      const content = await fs.readFile(skillMd, "utf8");
      const declaredName = parseFrontmatterName(content);
      const dirName = path.basename(skillDir);
      if (!declaredName) {
        errors.push(`Skill missing frontmatter name: ${toPosix(skillMd)}`);
      } else if (declaredName !== dirName) {
        errors.push(
          `Skill frontmatter name must match directory name: ${toPosix(skillMd)} (name=${declaredName}, dir=${dirName})`
        );
      }
    }
  }
}

async function discoverExtensionEntryPoints(rootDir) {
  const files = await listFiles(rootDir);
  const dirs = await listDirs(rootDir);

  const topLevel = files.filter((file) => file.endsWith(".ts"));
  const nested = [];

  for (const dirPath of dirs) {
    const indexPath = path.join(dirPath, "index.ts");
    if (await pathExists(indexPath)) nested.push(indexPath);
  }

  return [...topLevel, ...nested].sort();
}

async function validateExtensionTaxonomy() {
  if (!(await pathExists(extensionCoreRoot))) {
    errors.push(`Missing shared extension core directory: ${toPosix(extensionCoreRoot)}`);
    return;
  }

  const coreFiles = [
    "extension-core.ts",
    "guardian-extension-core.ts",
    "interceptor-extension-core.ts",
    "workflow-extension-core.ts",
    "widget-extension-core.ts",
    "integration-extension-core.ts",
    "ui.ts",
  ];

  for (const coreFile of coreFiles) {
    const corePath = path.join(extensionCoreRoot, coreFile);
    if (!(await pathExists(corePath))) {
      errors.push(`Missing extension core file: ${toPosix(corePath)}`);
    }
  }

  const extensionEntries = [
    ...(await discoverExtensionEntryPoints(extensionsRoot)),
    ...(await discoverExtensionEntryPoints(optionalExtensionsRoot)),
  ].sort();

  for (const extensionPath of extensionEntries) {
    const content = await fs.readFile(extensionPath, "utf8");
    const displayPath = toPosix(extensionPath);

    const extendsCategoryCore = EXTENSION_BASE_CLASSES.some((baseClass) =>
      new RegExp(`extends\\s+${baseClass}`).test(content)
    );

    if (!extendsCategoryCore) {
      errors.push(
        `Extension must extend a taxonomy core class (${EXTENSION_BASE_CLASSES.join(", ")}): ${displayPath}`
      );
    }

    if (!/protected\s+registerExtension\(\):\s*void/.test(content)) {
      errors.push(`Extension should implement protected registerExtension(): ${displayPath}`);
    }
  }
}

async function main() {
  await validateNoLegacyPhilosophy();
  await validatePromptTaxonomy();
  await validateSkillTaxonomy();
  await validateExtensionTaxonomy();

  if (errors.length > 0) {
    console.error("Taxonomy validation failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Taxonomy validation passed.");
  console.log(`Prompt categories: ${PROMPT_CATEGORIES.join(", ")}`);
  console.log(`Skill categories: ${SKILL_CATEGORIES.join(", ")}`);
  console.log(`Extension base classes: ${EXTENSION_BASE_CLASSES.join(", ")}`);
}

main().catch((error) => {
  console.error(`Taxonomy validation crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
