# Agent Definitions (Source of Truth)

This directory stores Jordan's reusable agent definitions for the `pi-subagents` extension.

> In this repo, the folder name remains `subagents/` for continuity.
> At runtime, Home Manager syncs this directory to `~/.pi/agent/agents/`, which is where `pi-subagents` discovers agents.

## Runtime mapping

- Repo source: `pi/agent/subagents/*.md`
- Runtime path: `~/.pi/agent/agents/*.md`
- Optional reusable chains: `*.chain.md` in the same runtime directory

## Frontmatter format (pi-subagents compatible)

Agent files are markdown with YAML frontmatter.

```yaml
---
name: planner
description: Produces implementation plans with milestones and risks
tools: read, bash, grep, find
model: anthropic/claude-sonnet-4-5
thinking: high
skill: safe-bash
output: context.md
defaultReads: context.md
defaultProgress: true
---

System prompt body here...
```

### Required fields

- `name`
- `description`

### Important formatting note

`tools` must be comma-separated for reliable parsing.

✅ `tools: read, bash, grep, find`

🚫 `tools: read bash grep find`

## Core commands

```bash
# Single agent
/run planner "Plan implementation for issue #123"

# Sequential chain
/chain code-explorer "Map relevant files" -> planner "Create plan" -> builder "Implement"

# Parallel tracks
/parallel code-explorer "Inspect backend" -> code-explorer "Inspect frontend"

# Agent manager UI
/agents
```

## Orchestration JSON

`pi/agent/subagents/orchestrations/*.json` stores orchestration artifacts in this repo.

## Maintenance

- Keep prompts framework-agnostic unless specialization is explicit (`rails-reviewer`, `frontend-reviewer`, etc.)
- Prefer minimal, focused updates
- Preserve names to avoid breaking existing workflows

Tool/profile heuristic lint helper:

```bash
node pi/agent/subagents/scripts/lint-tool-heuristics.mjs
node pi/agent/subagents/scripts/lint-tool-heuristics.mjs --strict
```
