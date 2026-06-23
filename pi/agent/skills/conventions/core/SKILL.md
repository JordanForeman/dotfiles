---
name: core
description: Core coding workflow guidance
injection: always
---

- Keep changes small, reversible, and directly tied to user intent.
- Read before editing and preserve existing local style/conventions.
- Avoid speculative refactors or opportunistic cleanups unless explicitly requested.
- When uncertain, investigate first; do not guess.
- A recent summary is not necessarily current truth. For fast-moving work, requirements drift after a description is written, so verify against the live source-of-truth discussion before acting on a stale artifact. Likewise, reproduce against real state (check out the actual branch/state under test) rather than reconstructing an approximation of it.
- For non-trivial execution requests, default to **plan → delegate → execute** instead of immediate solo implementation (see `tool-usage` for delegation topology).
