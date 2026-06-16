# 2026-06-16-003 — Shatter `clean-code` into dimensional standards

## Context

The `standards/` skills tier expressed "what good looks like" largely through a
single `clean-code` skill (`injection: classify`). That skill bundled five
distinct concerns — module/file structure, class/type design, method shape,
naming, and a "complementary principles" grab-bag — into one fragment.

This conflation caused three problems:

1. **No injection precision.** The whole umbrella injected (or didn't) as one
   unit, defeating the prompt-composer vision of injecting guidance *when it is
   most relevant*. Naming guidance (relevant on every keystroke of code) and
   module-structure guidance (relevant only when creating/splitting files) had
   the same trigger.
2. **Convention/standard blur.** Parts of clean-code were taste (gradient,
   "better or worse"); the "complementary principles" section was mostly
   duplication of *conventions* and *guides* that already exist
   (`test-first`, `refactoring`, `debugging`, per-language conventions).
3. **A missing dimension.** There was a `test-first` convention (when to write
   tests) but no testing *standard* (what a good test looks like) — despite
   strong existing opinions (behavioral-over-mock-expectation; don't widen
   public surface to enable testing).

## Decision

Delete `standards/clean-code` and decompose it along the gradient from
always-true to contextual:

| New skill          | Injection            | Source / rationale |
|--------------------|----------------------|--------------------|
| `naming`           | always               | Names carry intent on every code edit. The irreducible always-on floor of taste. |
| `code-shape`       | always               | Method-level shape (one abstraction level, named steps, no boolean toggles). Universal when authoring code. |
| `api-design`       | classify             | Class/type/interface design vocabulary + surface area. Only when shaping an interface. Absorbs "don't export privates to test." |
| `module-structure` | classify             | File-tree / domain-mirroring structure. Only during structural/file work. |
| `testing`          | classify + detect.files | NEW. Testing *taste* (behavioral assertions, one reason to fail). detect.files fallback on test-config presence. |

The "complementary principles" section was **deleted as duplication** — each
line already lives in `test-first`, `guides/debugging`, `guides/refactoring`,
or the per-language conventions, except for two lines folded into `naming`
(comments) and `api-design`/`code-shape` (low-coupling).

Resulting always-on standards: `naming`, `code-shape`, `concise-output`.

## Rationale

- **Injection precision (Point 2).** Each dimension now injects on its own
  trigger. Always-on taste shrinks to naming + shape + concision; contextual
  taste (design, structure, testing) injects only when relevant.
- **Convention vs. standard (Point 1).** Decomposition forced the explicit
  call: gradient quality bars stay in `standards/`; rule-like duplication was
  removed rather than re-homed.
- **"Good" gets real dimensions (Point 3).** "Clean code" was too coarse to be
  actionable; naming / shape / api-design / module-structure / testing are
  each independently injectable and reviewable.

## Alternatives rejected

- **Medium (3 skills)** — merge naming+shape and class+module. Rejected: loses
  the always-vs-contextual split that motivated the work.
- **Naming-first split (2 skills)** — extract only naming, leave a slimmed
  clean-code. Rejected: defers the design/testing split and keeps an umbrella.
- **`testing` as `classify`-only** — rejected in favor of `classify +
  detect.files` so the skill also fires in any repo with a test harness, not
  only when the prompt mentions tests. (prompt-composer `detect` matches
  repo-level file *existence*, not the file being edited, so editing a test
  file can't itself be a trigger.)
- **Re-home `minimize-file-creation` / `avoid-over-engineering` as
  conventions** — noted as likely-misfiled (they read as rules, not taste) but
  deferred to a separate, lower-risk change.

## Validation

- `node pi/agent/scripts/validate-taxonomy.mjs` → pass (25 subagents, all
  injection types valid).
- Zero residual `clean-code` references in `pi/`, `nix/`, `AGENTS.md`
  (two prose mentions in AGENTS.md updated).
- No prompt-composer code change required — skills are discovered by walking
  the tree, so add-a-directory / delete-a-directory is sufficient.
