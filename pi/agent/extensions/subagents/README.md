# Subagents Extension

Claude Code-style delegated subagents for Pi.

## What it adds

- `subagent_list` tool: discover available subagents and metadata
- `subagent` tool with 4 execution modes:
  - single
  - parallel
  - chain (serial)
  - orchestration (serial stages + parallel tasks per stage)
- `/subagents` command: list/show/paths/scaffold for subagents + orchestration configs
- Runtime TypeBox validation for orchestration JSON configs (shape + limits)
- XState-backed orchestration lifecycle state machine (explicit stage start/progress/complete/fail transitions)
- Active orchestration widget + status affordances in the session UI while subagents are running

## Dependencies

This extension depends on `xstate`.

In this dotfiles setup, dependencies are installed automatically by Home Manager activation (`nix/home/pi.nix`) during `./install.sh` / `home-manager switch`, so manual steps are typically not needed.

Manual fallback:

```bash
cd ~/.pi/agent/extensions/subagents
npm ci --omit=dev
```

## Subagent definition locations

Default (user scope):

- `~/.pi/agent/subagents/*.md`

Project scope (optional):

- `.pi/agent/subagents/*.md` (nearest ancestor project)


## Definition format

```md
---
name: log-viewer
description: Investigate logs and summarize likely root causes
tools: read, grep, find, ls, bash
provider: openai-codex
model: gpt-5.3-codex
tags: logs,debugging
---

System prompt for the subagent.
```

## Orchestration config locations

Default (user scope):

- `~/.pi/agent/subagents/orchestrations/*.json`

Project scope (optional):

- `.pi/agent/subagents/orchestrations/*.json` (nearest ancestor project)

Project configs override user configs with the same `name`.

## Command quickstart

Subagents:

- `/subagents list [user|project|both]`
- `/subagents show <name> [user|project|both]`
- `/subagents paths`
- `/subagents scaffold <name> [description]`
- `/subagents orchestrate <config-name> <task/relation>`

Orchestration configs:

- `/subagents orchestration list [user|project|both]`
- `/subagents orchestration show <name> [user|project|both]`
- `/subagents orchestration paths`
- `/subagents orchestration scaffold <name> [description]`

## Orchestration mode (tool)

You can run orchestration in 2 ways:

1) Inline orchestration stages:

```json
{
  "scope": "both",
  "orchestration": [
    {
      "label": "research",
      "tasks": [
        { "subagent": "planner", "task": "Map constraints and acceptance criteria" },
        { "subagent": "log-viewer", "task": "Collect relevant runtime signals" }
      ]
    },
    {
      "label": "synthesis",
      "tasks": [
        {
          "subagent": "planner",
          "task": "Produce final recommendation using:\n\n{previous}"
        }
      ]
    }
  ]
}
```

2) Named orchestration config (JSON file):

```json
{
  "orchestrationConfig": "research-synthesis",
  "orchestrationConfigScope": "both"
}
```

Example orchestration config file:

```json
{
  "name": "research-synthesis",
  "description": "Parallel discovery then synthesis",
  "relation": "Produce implementation recommendation for parent task",
  "scope": "both",
  "confirmProjectSubagents": true,
  "stages": [
    {
      "label": "research",
      "tasks": [
        { "subagent": "planner", "task": "Map constraints" },
        { "subagent": "log-viewer", "task": "Gather relevant logs" }
      ]
    },
    {
      "label": "synthesis",
      "tasks": [
        { "subagent": "planner", "task": "Summarize using:\n\n{previous}" }
      ]
    }
  ]
}
```

- Stages run serially.
- Tasks inside each stage run in parallel.
- `{previous}` injects prior stage output.
