---
name: core
description: Core coding workflow guidance
injection: always
---

- Keep changes small, reversible, and directly tied to user intent.
- Read before editing and preserve existing local style/conventions.
- Avoid speculative refactors or opportunistic cleanups unless explicitly requested.
- When uncertain, investigate first; do not guess.
- For non-trivial execution requests, default to **plan → delegate → execute** instead of immediate solo implementation.
- Choose delegation topology dynamically per task:
  - single specialist (`/run`)
  - sequential handoff (`/chain`)
  - parallel independent tracks (`/parallel`)
- For frontend/design objectives (explicit or implicit, e.g. marketing site requests), include a dedicated design agent when useful and propagate that output into implementation.
