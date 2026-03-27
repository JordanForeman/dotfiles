---
description: Review changes (staged by default)
workflow: pr-review
subagents: [pr-triage, design-reviewer, rails-reviewer, frontend-reviewer, testing-reviewer]
---
Review the current changes.

1) Run `git diff --cached` (if there are no staged changes, fall back to `git diff`).
2) Identify: bugs/logic issues, error handling gaps, security concerns, and style inconsistencies.
3) Suggest concrete fixes.
