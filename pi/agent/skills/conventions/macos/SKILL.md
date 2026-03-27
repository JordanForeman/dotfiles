---
name: macos
description: macOS-specific shell guidance
injection: detect
detect:
  platform: darwin
---

- Assume macOS shell environment (BSD userland differences may apply).
- Avoid Linux-only flags unless verified on macOS equivalents.
- Quote paths with spaces and favor absolute paths in shell commands.
