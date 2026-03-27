---
description: Prepare changes and open/update a pull request safely
subagents: [git-ops]
---
Prepare and publish the current work as a pull request.

Workflow:
1. Inspect branch/diff scope versus default branch and summarize what will ship.
2. Confirm branch/worktree safety (avoid main worktree for feature work).
3. Run or suggest relevant validation checks before publishing.
4. Delegate all git operations to `git-ops` (staging, commit creation, push).
5. Ask for confirmation before any network-visible action (push/PR create/edit).
6. Create or update the PR with:
   - short title
   - concise summary bullets
   - test/verification checklist
7. Return PR URL and a short summary of what was published.

Constraints:
- Keep commit/PR scope tight and intentional.
- Do not force push unless explicitly requested.
- Do not include secrets or unrelated files.
