---
description: Triage a GitHub issue — understand it and propose solutions
---
Triage the GitHub issue at $1.

1. Load the issue: `gh issue view $1`
2. Ask for any additional context (screenshots, reproduction steps)
3. Use the `subagent` tool with `code-explorer` to investigate the relevant code
4. Provide:
   - **Root cause analysis** (or best hypothesis)
   - **2-3 potential solutions** ranked by complexity and risk
   - **Recommended approach** with justification
