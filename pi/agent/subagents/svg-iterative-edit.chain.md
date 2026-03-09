---
name: svg-iterative-edit
description: Iteratively tune SVG edits via preview variants, then apply the approved parameter and finalize outputs.
---

## svg-editor
output: preflight.md
progress: true

Preflight {task} before any mutation:
- confirm `inkscape` is installed and callable
- confirm target SVG path(s) exist and are readable
- define canonical output SVG and preview PNG paths
- define one explicit tunable parameter for this run (e.g., clip height, spacing, scale)
If blocked, stop with exact blocker and next command.

## svg-editor
reads: preflight.md
output: variants.md
progress: true

Generate an iterative variant batch for {task}:
- export baseline preview
- generate 3-6 preview variants by changing only the chosen parameter
- keep all other variables fixed
- report exact parameter values and preview file paths
Do not overwrite canonical output in this step.

## svg-editor
reads: preflight.md, variants.md
output: apply.md
progress: true

Apply only the user-approved variant value from {task}:
- if a chosen value is present, apply it to canonical output
- if no chosen value is provided, do not mutate canonical output; return a concise pick-list from generated variants
- if composing multiple SVG files, prefix IDs before merge and use explicit transforms for alignment/spacing

## svg-editor
reads: preflight.md, variants.md, apply.md
output: final.md
progress: true

Finalize {task}:
- verify canonical output exists and is non-empty
- prove non-no-op (hash/diff against input or prior canonical)
- export final preview
- summarize final paths, selected parameter, and remaining optional refinements
