# 2026-06-16-005 — Reclassify scope-discipline skills: standards → conventions

## Context

Decisions -003 and -004 flagged but deferred a reclassification: two skills
filed under `standards/` read as **rules (pass/fail), not taste (gradient)**,
which is the defining test for convention vs. standard:

- `minimize-file-creation` — "Prefer editing existing files… do not create
  files unless absolutely necessary." A binary directive.
- `avoid-over-engineering` — "Only make changes directly requested… don't add
  features/refactors/docstrings beyond what was asked." A list of binary
  constraints.

Both are objective constraints you either honored or violated — conventions,
not quality bars. `ambitious-tasks`, by contrast, is a genuine posture/taste
("operate at high capability"), so it stays in `standards/`.

## Decision

`git mv` both skills from `standards/` to `conventions/`:

- `standards/minimize-file-creation` → `conventions/minimize-file-creation`
- `standards/avoid-over-engineering` → `conventions/avoid-over-engineering`

No frontmatter change: `name` already matches the directory, and
`injection: classify` is valid in `conventions/` (peers `code-security`,
`code-references` already use classify there). `ambitious-tasks` retained in
`standards/`.

## Rationale

- The convention/standard line is "can it be violated (rule)" vs. "can it only
  be better/worse satisfied (taste)." Both moved skills are rules.
- Keeps the taxonomy honest: `standards/` should be pure taste so its skills
  are reviewable as quality gradients, not checklists.

## Alternatives rejected

- **Also move `ambitious-tasks`** — rejected: it's a capability posture, not a
  pass/fail rule. A memory card erroneously claimed all three were moved; only
  the two rules were.
- **Change injection while moving** — rejected: classify remains correct; the
  move is purely categorical.

## Validation

- `git mv` (history preserved).
- `node pi/agent/scripts/validate-taxonomy.mjs` → pass (25 subagents, all
  categories/injection types valid).
- Pre-move grep confirmed zero references to either skill by path/name outside
  their own SKILL.md; AGENTS.md example lists don't name them.

## Final tier state

- **standards/**: `ambitious-tasks`, `api-design`, `code-shape`,
  `concise-output`, `frontend-aesthetics`, `module-structure`, `naming`,
  `testing`.
- **conventions/** gained: `avoid-over-engineering`, `minimize-file-creation`.
