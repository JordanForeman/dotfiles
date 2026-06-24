---
name: core
description: Core coding workflow guidance
injection: always
---

- Keep changes small, reversible, and directly tied to user intent.
- Read before editing and preserve existing local style/conventions.
- Avoid speculative refactors or opportunistic cleanups unless explicitly requested.
- When uncertain, investigate first; do not guess.
- A summary is not the source of truth. Verify against the live artifact and reproduce against real state before acting, rather than trusting a description that may have drifted.
- For non-trivial execution requests, default to **plan → delegate → execute** instead of immediate solo implementation (see `tool-usage` for delegation topology).
