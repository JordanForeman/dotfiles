---
name: validation-discovery
description: Discover and run a project's own validation contract instead of imposing your own
injection: detect
detect:
  mode: write
---

When validating a change, **discover the project's own validation contract — do not impose one.** Many projects are not yours; enforcing a personal validation spec on a codebase you contribute to is wrong. Adapt to what the project already declares.

### Discovery ladder (highest authority first)

1. **Declared agent contract.** Read `AGENTS.md` / `CLAUDE.md` for an explicit validation, testing, or "how to check this" section.
2. **Conventional task runners.** `Makefile`, `Justfile`, `package.json` scripts, or a `bin/` directory with conventional targets (`test`, `lint`, `typecheck`, `check`, `ci`).
3. **CI config.** `.github/workflows/`, `.buildkite/`, etc. — the project already encoded what "passing" means; read and mirror it.
4. **Language defaults.** Only if nothing above exists: `go test ./...`, `cargo test`, `bundle exec rake`, `npm test`, `dev tc` / `dev style` (Shopify monorepo), etc.

### Universal invariants (always check, regardless of project)

- The change builds / typechecks under the project's own toolchain.
- New behavior has a test (per `test-first`). This is discipline, not project policy.
- No left-behind debug artifacts; no public API broadened solely to enable testing.

When validation exposes unrelated environment drift or pre-existing failures, separate that from the targeted result for the touched code. Report both; do not let ambient drift erase a meaningful targeted pass, and do not call the whole project green.

### Honest abstention

If no validation contract is discoverable, **say so explicitly.** Downgrade from a pass/fail verdict to "here is what I ran and what I could not verify." Never fabricate a green result or silently skip validation. Surface the gap and let the user decide.
