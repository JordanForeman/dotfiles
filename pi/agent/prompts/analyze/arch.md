---
description: Analyze the architecture of a component or subsystem
subagents: [architect]
---
Provide a detailed architectural analysis of `$1`.

Use the `subagent` tool to delegate this to the `architect` subagent:

```json
{
  "subagent": "architect",
  "task": "Analyze the architecture of $1. Identify core models, relationships, dependencies, and integration points. Provide a clear structural overview.",
  "relation": "Architectural analysis requested by parent session"
}
```
