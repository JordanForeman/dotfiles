# 2026-06-16-004 — Conventions audit: de-duplicate and de-bleed the always-on set

## Context

After shattering `clean-code` (decision -003), we applied the same
convention-vs-standard + injection-precision lens to the `conventions/` tree.

Finding: conventions did **not** have the taste-vs-rule miscategorization the
standards tier had — every convention is genuinely a rule (pass/fail). But the
tree had three duplication / concern-bleed defects, concentrated in the
always-on set (which is the most expensive real estate — injected every turn):

1. **Exact duplicate.** `conventions/safety/SKILL.md` (injection: always) and
   `conventions/careful-actions/SKILL.md` (injection: classify) had
   **byte-identical bodies**. `safety` already injects every turn, so
   `careful-actions` only added a second identical copy whenever the classifier
   picked it.
2. **`core` mini-umbrella.** `conventions/core` (always) bundled three
   concerns: genuine core workflow; a restatement of `test-first` ("Write tests
   before implementation" — `test-first` is *also* always-injected); and
   delegation topology.
3. **Delegation smear.** Delegation-topology guidance was split across two
   always-on skills (`core` and `tool-usage`), partially restated in each.

`careful-actions` was referenced only in `discipline-gate.ts` comments + a UI
label string (`"⚖️  careful-actions"`) and in a `prompt-composer` classifier
*example* — never loaded by path. The guardian's destructive-bash detection is
pattern-based (`DESTRUCTIVE_BASH` regexes), not skill-name-based.

## Decision

Applied all three fixes:

- **F1 — collapse the duplicate.** Deleted `conventions/careful-actions`.
  `safety` is now the single source of truth for blast-radius/reversibility.
  Relabeled the discipline-gate guardian's destructive-bash block from
  "careful-actions" → "safety" (comments, label string, block reason). Updated
  the prompt-composer classifier example to a real skill
  (`conventions/code-security`).
- **F2 — de-duplicate test-first from core.** Removed core's "Write tests
  before implementation" bullet; `test-first` (always-on) owns TDD.
- **F3 — consolidate delegation into tool-usage.** Moved core's delegation
  bullets (single/sequential/parallel, design-agent) into a "Delegation
  topology" section in `tool-usage`. `core` now keeps a one-line pointer
  (plan → delegate → execute, see `tool-usage`).

Net: `core` = pure workflow discipline; `test-first` = TDD; `tool-usage` =
tool selection + delegation; `safety` = blast radius. No always-on skill
repeats another.

## Rationale

- Always-on skills are injected every turn; duplication there is paid on every
  request. Removing the exact duplicate and two restatements shrinks the
  always-on footprint with zero behavior loss.
- One concern → one skill keeps injection precise and review tractable.
- Pattern-based enforcement means the guardian label is cosmetic; renaming it
  to match the surviving skill removes a dangling concept.

## Alternatives rejected

- **Keep careful-actions as `injection: explicit` pointer to safety** —
  rejected: nothing loads it by path, so the name need not survive as a skill;
  the guardian label carries the concept.
- **F1 only / F1+F2 only** — rejected in favor of all three; the delegation
  smear is the same class of defect and cheap to fix while here.
- **Reclassify `ambitious-tasks` / `avoid-over-engineering` /
  `minimize-file-creation` standards→conventions** — still deferred (noted in
  -003). NOT done in this change despite a memory card erroneously claiming it
  was.

## Validation

- `node pi/agent/scripts/validate-taxonomy.mjs` → pass (25 subagents).
- Zero residual `careful-actions` references in `pi/`, `nix/`, `AGENTS.md`.
- `core` no longer contains "Write tests before implementation".
- `discipline-gate.ts` braces balanced (84/84).
