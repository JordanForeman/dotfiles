# Pi (global)

These are global instructions for Pi sessions on my machines.

## General behavior

- Prefer **small, safe, incremental changes**.
- Ask before running destructive commands (anything involving `rm`, `sudo`, rewriting history, or deleting/overwriting large file trees).
- When editing files, preserve existing style and conventions.
- Prefer `rg`/`fd`/`eza` for search/listing.

## Git workflow

- Assume my repos in `~/Work` use **git worktrees**.
- Avoid making changes on a `main` worktree unless explicitly requested.
- If you need to do feature work, create/use a dedicated worktree.

## Subagent delegation

- You have specialized subagents available; use them proactively whenever a task or sub-task aligns with a subagent's specialization.
- For large or multi-phase requests, prefer delegated execution through the `subagent` tool and the slash commands provided by the subagents package.
- Use execution modes intentionally:
  - single specialist: `/run <agent> <task>` or `{ agent, task }`
  - sequential handoff: `/chain ...` or `{ chain: [...] }`
  - independent parallel tracks: `/parallel ...` or `{ tasks: [...] }`
- Use `/agents` when you need to inspect, create, or adjust agent definitions/chains.
- Prefer direct execution only for small, straightforward work where delegation overhead would not improve quality or speed.
- When asked to perform **git operations** (e.g. commit, stage, branch, rebase, push), delegate to the `git-ops` subagent via the `subagent` tool.
- If the request involves destructive git actions, require explicit confirmation from the user before proceeding.

## Output preferences

- Be concise and information-dense.
- Use markdown with code fences for code.
- When suggesting commands, show them in a single copy/pasteable block.
