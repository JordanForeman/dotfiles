---
name: worktree
description: Git worktree conventions
injection: detect
detect:
  files: [.git]
---

- Respect git worktree conventions.
- Avoid making feature changes in the main worktree unless explicitly requested.
- Keep branch/worktree context explicit before staging, committing, rebasing, or pushing.
- If running parallel implementation tracks that mutate files, isolate tracks in dedicated worktrees to avoid conflicts.
- For git operations, delegate to the git-ops subagent.
