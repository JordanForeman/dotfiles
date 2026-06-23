---
name: debugging
description: User is debugging, investigating an error, trying to understand why something doesn't work, or reporting a bug
injection: classify
---

- Start by reproducing the issue before attempting fixes.
- Read and understand the relevant code paths before proposing changes.
- Form hypotheses and verify them systematically; avoid shotgun debugging.
- Check error messages, stack traces, and logs carefully before guessing.
- When state was unexpectedly clobbered, attribute the cause forensically: correlate file mtimes with shell-history and log timestamps to find which process actually wrote it, rather than blaming the most obvious tool. A narrowly-scoped operation (e.g. one that renames a single file) cannot be responsible for a wider change — verify the suspected cause's real blast radius before concluding.
- When a fix is applied, verify it resolves the original issue and doesn't introduce regressions.
- Explain the root cause, not just the fix.
