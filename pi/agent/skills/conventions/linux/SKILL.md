---
name: linux
description: Linux-specific shell guidance
injection: detect
detect:
  platform: linux
---

- Assume GNU/Linux shell semantics and typical GNU coreutils behavior.
- Quote paths with spaces and prefer absolute paths in shell commands.
- Be mindful of case-sensitive file paths and permissions differences vs macOS/Windows.
