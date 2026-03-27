---
description: Create a single high-signal commit from current changes
subagents: [git-ops]
---
Create one commit for the current changes.

Workflow:
1. Inspect repo state (`git status --short`, `git diff --cached`, then `git diff` if needed).
2. Draft a conventional commit message (subject + body) that explains why.
3. Ask for confirmation of the message and staged file scope.
4. Delegate all git operations to the `git-ops` subagent (stage, verify staged diff, commit).
5. Return commit hash, final branch, and post-commit status.

Constraints:
- Stage only intended files.
- Never amend unless explicitly requested.
- Never skip hooks unless explicitly requested.
- If there is nothing to commit, report it clearly and stop.
