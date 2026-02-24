# Subagent orchestration configs

JSON orchestration configs in this directory are synced to:

- `~/.pi/agent/subagents/orchestrations/*.json`

Project-local configs can also live at:

- `.pi/agent/subagents/orchestrations/*.json` (nearest ancestor project)

Example:

```json
{
  "name": "research-synthesis",
  "description": "Parallel discovery then synthesis",
  "scope": "both",
  "confirmProjectSubagents": true,
  "stages": [
    {
      "label": "research",
      "tasks": [
        { "subagent": "planner", "task": "Map constraints" },
        { "subagent": "log-viewer", "task": "Gather logs" }
      ]
    },
    {
      "label": "synthesis",
      "tasks": [
        { "subagent": "planner", "task": "Summarize using:\n\n{previous}" }
      ]
    }
  ]
}
```
