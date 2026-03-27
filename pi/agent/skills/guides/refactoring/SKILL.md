---
name: refactoring
description: User is refactoring, restructuring, cleaning up, or reorganizing existing code without changing behavior
injection: classify
---

- Ensure tests pass before and after refactoring.
- Make one logical change per step; avoid combining refactoring with behavior changes.
- Preserve external interfaces unless the refactoring explicitly changes them.
- Delete dead code completely rather than commenting it out or adding compatibility shims.
- Avoid renaming unused variables with underscore prefixes as a workaround; remove them entirely if unused.
