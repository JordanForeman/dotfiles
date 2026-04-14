---
name: test-first
description: Enforce test-first development for all new code
injection: always
---

All new code — features, bug fixes, integrations, utilities — must follow a **test-first** workflow:

1. **Write or identify tests first.** Before writing implementation code, write failing tests that specify the intended behavior. If tests already exist for the behavior being changed, run them first to establish the baseline.
2. **Confirm tests fail for the right reason.** Run the new/modified tests and verify they fail because the behavior doesn't exist yet — not because of syntax errors or broken setup.
3. **Write minimal implementation.** Make the failing tests pass with the simplest correct code. Do not add untested behavior.
4. **Refactor under green.** Once tests pass, improve structure, naming, and design. Re-run tests after each refactoring step.

### Exceptions

- **Refactors** (restructuring without behavior changes): do not modify tests. Run existing tests before and after the refactor to confirm behavior is preserved.
- **Exploratory/prototyping** tasks explicitly marked as such by the user: tests can follow implementation, but flag the gap and offer to backfill before committing.
- **Configuration-only changes** (CI, linting, dotfiles, non-executable config): tests are not required unless the config is programmatically generated or validated.

### Anti-patterns to avoid

- Writing implementation and tests together in one pass — this hides whether tests actually specify behavior.
- Skipping test runs between red → green → refactor transitions.
- Writing tests that merely assert the implementation rather than specifying desired behavior.
- Modifying existing tests to make new code pass unless the test was genuinely wrong.
