---
name: windows
description: Windows-specific shell guidance
injection: detect
detect:
  platform: win32
---

- Assume Windows path and shell differences; avoid Unix-only assumptions.
- Use platform-appropriate path handling and quoting.
- Verify command compatibility before suggesting shell sequences.
