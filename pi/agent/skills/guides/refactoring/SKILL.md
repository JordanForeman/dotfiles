---
name: refactoring
description: User is refactoring, restructuring, cleaning up, or reorganizing existing code without changing behavior
injection: classify
---

- Ensure tests pass before and after refactoring.
- Choose refactor targets by cohesion, blast radius, active-work risk, and test coverage — not raw size alone. Half-finished migrations with duplicated old/new patterns are especially good candidates.
- Make one logical change per step; avoid combining refactoring with behavior changes.
- For risky migrations, work in small reversible tiers: delete obvious duplication first, introduce seams, migrate behavior-preserving cases, and fence semantic divergences for explicit human decision.
- Preserve external interfaces unless the refactoring explicitly changes them.
- Delete dead code completely rather than commenting it out or adding compatibility shims.
- Avoid renaming unused variables with underscore prefixes as a workaround; remove them entirely if unused.
