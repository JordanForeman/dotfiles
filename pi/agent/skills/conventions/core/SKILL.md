---
name: core
description: Core coding workflow guidance
injection: always
---

- Keep changes small, reversible, and directly tied to user intent.
- Read before editing and preserve existing local style/conventions.
- Avoid speculative refactors or opportunistic cleanups unless explicitly requested.
- When uncertain, investigate first; do not guess.
- For non-trivial execution requests, default to **plan → delegate → execute** instead of immediate solo implementation (see `tool-usage` for delegation topology).
