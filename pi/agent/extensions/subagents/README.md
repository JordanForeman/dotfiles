# Subagents Extension

Claude Code-style delegated subagents for Pi.

## What it adds

- `subagent_list` tool: discover available subagents and metadata
- `subagent` tool with 5 execution modes:
  - single
  - parallel
  - chain (serial)
  - orchestration (serial stages + parallel tasks per stage)
  - teams (parallel orchestration-of-orchestrations)
- Runtime prompt catalog injection: each turn appends a compact list of discoverable subagents (name, source, description, tags) so the parent agent has ambient awareness of available specialists
- Natural-language team-intent detection (`input` transform) for prompts like "make a team for this" to bias toward teams mode automatically
- `/subagents` command: list/show/paths/scaffold for subagents + orchestration configs + team launch shortcut
- `/teams` command: list/show/cancel/cleanup for team runs and worktrees
- Runtime TypeBox validation for orchestration JSON configs (shape + limits)
- XState-backed orchestration lifecycle state machine (explicit stage start/progress/complete/fail transitions)
- Team runtime state tracking (queued/provisioning/running/succeeded/failed/cancelled/skipped) with worktree metadata
- Active workflow widget + status affordances in the session UI while subagents are running

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

Notes:
- `tools` is an execution allowlist, not just metadata. The extension forwards it to the spawned subagent via `pi --tools ...`.
- Unknown tool names are not usable unless a matching tool is actually registered in that subagent session.
- If a subagent needs git mutations and only `bash` is available, keep `bash` for now or provide a dedicated custom git tool first.

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
- `/subagents team <config-name> <team::task> [|| team::task ...]`

Orchestration configs:

- `/subagents orchestration list [user|project|both]`
- `/subagents orchestration show <name> [user|project|both]`
- `/subagents orchestration paths`
- `/subagents orchestration scaffold <name> [description]`

Teams:

- `/teams list`
- `/teams show <team-id|name>`
- `/teams cancel <team-id|name>`
- `/teams cleanup <team-id|name|all>`
- `/teams do <objective>`
- `/teams create <reusable-team-description>`

`/teams <freeform objective>` is treated as shorthand for `/teams do <objective>`.

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

## Teams mode (tool)

Use `teams` to run multiple named orchestration configs concurrently.

Each team is provisioned in its own **git worktree** before orchestration starts.

Quick launcher command:

```bash
/subagents team feature-dev-pipeline api::"Build API changes" || ui::"Build UI changes"
```

Launcher defaults:
- `teamsConcurrency = min(2, number_of_teams)`
- `teamsFailureMode = continue`

Use raw JSON tool invocation when you need custom `teamsConcurrency`, `teamsFailureMode`, `baseRef`, or `worktreeParent`.

```json
{
  "teams": [
    {
      "name": "checkout-api",
      "orchestrationConfig": "feature-dev-pipeline",
      "task": "Implement checkout API retry/backoff improvements"
    },
    {
      "name": "checkout-ui",
      "orchestrationConfig": "feature-dev-pipeline",
      "task": "Implement checkout error/retry UX"
    }
  ],
  "teamsConcurrency": 2,
  "teamsFailureMode": "continue"
}
```

Optional team fields:
- `baseRef`: git ref used for `git worktree add` (default `HEAD`)
- `worktreeParent`: parent dir for worktree creation
- `orchestrationConfigScope`: config discovery scope (`user|project|both`)

Failure modes:
- `continue`: run all teams; report failures at the end
- `fail-fast`: stop scheduling new teams after first failure
- `cancel-running`: abort in-flight teams after first failure

## Team manager interactions

### `/teams do <objective>`
Queues a parent-session instruction to plan and execute the objective through teams mode.

Example:
```bash
/teams do Implement GitHub issue #123 with API + UI tracks
```

Shorthand (same behavior):
```bash
/teams Implement GitHub issue #123 with API + UI tracks
```

Natural-language prompts such as "do this and make a team for yourself" are also transformed with a teams-mode hint automatically.

### `/teams create <description>`
Queues a parent-session instruction to create reusable team artifacts (subagents/orchestrations/docs) for future sessions.

Example:
```bash
/teams create "A generalist team that can implement scoped features end-to-end"
```
