---
name: git-ops
description: Git commit and operation best practices
injection: detect
detect:
  files: [.git]
---

- Prefer creating new commits over amending existing ones.
- Never skip git hooks (no --no-verify).
- Avoid destructive git operations (force push, reset --hard) without explicit confirmation.
- When a repo syncs to a separate Git host via a one-way mirror, the two can silently diverge: external systems (automated translation, codegen) may push commits directly to the host, bypassing the mirror. Before pushing, fetch the actual host HEAD (not just the mirror's view) and integrate any out-of-band commits by rebasing on top of them. Never force-push there — it can drop committed work the branch depends on.
- When creating commits, write clear, conventional commit messages.
- Stage only the intended files. When asked to commit complete work, inspect untracked changes before leaving them out; include them, exclude them with rationale, or ask.
- Quote file paths with spaces in git commands.
