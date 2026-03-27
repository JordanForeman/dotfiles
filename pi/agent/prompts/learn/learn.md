---
description: Learn about a domain concept through interactive teaching
subagents: [code-explainer]
---
Use the `subagent` tool to delegate to the `code-explainer` subagent:

```json
{
  "subagent": "code-explainer",
  "task": "Teach the user about: $@. Start with fundamentals and progressively build understanding. Use real code examples from the codebase where relevant.",
  "relation": "Interactive teaching request from parent session"
}
```
