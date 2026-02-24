# Subagents Extension

Claude Code-style delegated subagents for Pi.

## What it adds

- `subagent_list` tool: discover available subagents and metadata
- `subagent` tool: invoke one subagent, many in parallel, or a chain
- `/subagents` command: list/show/paths/scaffold for definition management
- Active workflow widget in the session UI while subagents are running

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

## Command quickstart

- `/subagents list [user|project|both]`
- `/subagents show <name> [user|project|both]`
- `/subagents paths`
- `/subagents scaffold <name> [description]`
