---
name: tool-usage
description: Tool selection policy
injection: always
---

- Prefer dedicated tools for file operations over shell command workarounds.
- Use parallel tool calls for independent reads/searches to reduce latency.
- Sequence dependent operations explicitly; do not use placeholder arguments.
- Communicate directly in assistant text, never via shell echo/printf.
- For multi-agent work, prefer the `subagent` tool over manual roleplay.
- Use chain or parallel execution (`/chain`, `/parallel`, or `subagent` `chain`/`tasks`) based on dependency structure.
- When in doubt, pick the smallest viable delegation topology first, then expand only if needed.
