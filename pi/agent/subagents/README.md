# Subagent definitions

Markdown files in this directory are synced to:

- `~/.pi/agent/subagents/*.md`

Each file should include frontmatter:

```md
---
name: my-subagent
description: What this subagent specializes in
tools: read, grep, find, ls
model: claude-haiku-4-5
---

System prompt body...
```
