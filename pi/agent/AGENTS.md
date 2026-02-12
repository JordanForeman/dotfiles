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

## Output preferences

- Be concise and information-dense.
- Use markdown with code fences for code.
- When suggesting commands, show them in a single copy/pasteable block.
