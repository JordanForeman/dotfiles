# Agent Definitions

Reusable agent definitions for the `pi-subagents` extension. See root **AGENTS.md §6** for the frontmatter schema and validation rules.

## Runtime mapping

- Repo source: `pi/agent/subagents/*.md`
- Runtime path: `~/.pi/agent/agents/*.md` (synced by Home Manager)
- Reusable chains: `*.chain.md` in the same directory

## Commands (from pi-subagents)

```bash
/run planner "Plan implementation for issue #123"
/chain code-explorer "Map files" -> planner "Create plan" -> builder "Implement"
/parallel code-explorer "Inspect backend" -> code-explorer "Inspect frontend"
/agents
```

## Formatting note

`tools` must be comma-separated: `tools: read, bash, grep, find`

## Maintenance

- Keep prompts framework-agnostic unless specialization is explicit
- Prefer minimal, focused updates
- Preserve names to avoid breaking existing workflows

```bash
node pi/agent/subagents/scripts/lint-tool-heuristics.mjs
```
