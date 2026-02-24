---
description: Analyze the architecture of a component or subsystem
---
Provide a detailed architectural analysis of `$1`.

Use the `subagent` tool to delegate this to the `architect` agent:

```json
{ "agent": "architect", "task": "Analyze the architecture of $1. Identify core models, relationships, dependencies, and integration points. Provide a clear structural overview." }
```
