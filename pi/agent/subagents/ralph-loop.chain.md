---
name: ralph-loop
description: One Ralph loop increment using planner, recon, implementer, validator, and historian roles.
---

## ralph-planner
output: plan-step.md
progress: true

Plan one scoped increment for {task}. Use @.pi/ralph/plan.md and @.pi/ralph/policy.json when available. Output strict acceptance criteria and required validation gates.

## ralph-recon
reads: plan-step.md
output: recon-step.md
progress: true

Run focused recon for the selected increment from plan-step.md. Prove what already exists before edits and identify target files/tests.

## ralph-implementer
reads: plan-step.md, recon-step.md
output: implement-step.md
progress: true

Implement one increment only from plan-step.md using recon-step.md evidence. Keep edits small, avoid placeholders, and run targeted checks.

## ralph-validator
reads: plan-step.md, implement-step.md
output: validate-step.md
progress: true

Apply validation gates for the increment and provide strict pass/fail evidence with remediation guidance.

## ralph-historian
reads: plan-step.md, implement-step.md, validate-step.md
output: history-step.md
progress: true

Update @.pi/ralph/plan.md and @.pi/ralph/runbook.md based on results. Keep priority order clear and document durable learnings only.