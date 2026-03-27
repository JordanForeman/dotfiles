---
description: Perform a focused, high-confidence security review of current diff
subagents: [reviewer, testing-reviewer]
---
Perform a security-focused review of the current change set.

Workflow:
1. Review `git diff --cached`; if empty, review `git diff`.
2. Focus on high-confidence issues only:
   - injection risks (SQL/command/template/path)
   - authz/authn bypasses
   - unsafe secret handling/logging
   - trust-boundary validation failures
3. Ignore speculative or low-impact noise.
4. Provide a markdown report with:
   - severity
   - file/path
   - vulnerable behavior
   - exploit path
   - concrete fix
5. If no meaningful findings, explicitly state that with confidence caveats.

Optional:
- For broader coverage, delegate to `reviewer` and `testing-reviewer` in parallel, then synthesize.
