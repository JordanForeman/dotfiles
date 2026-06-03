---
name: ralph-loop
description: One Ralph loop increment using planner, recon, implementer, validator, and historian roles.
---

> Legacy/manual chain: Ralph v2 primary execution is the WorkflowEngine-backed `/ralph:start` flow (`ralph-groomer` → repeated `ralph-worker` → `ralph-summarizer`). This chain remains for explicit manual use only and is not invoked by `/ralph:start`.

## ralph-planner
output: plan-step.md
progress: true

Plan one scoped increment for {task}. Use @.pi/ralph/plan.md when available. Output strict, testable acceptance criteria. Do not prescribe a fixed gate list — validation is discovered from the project's own contract at execution time.

## ralph-recon
reads: plan-step.md
output: recon-step.md
progress: true

Run focused recon for the selected increment from plan-step.md. Prove what already exists before edits and identify target files/tests.

## ralph-implementer
reads: plan-step.md, recon-step.md
output: implement-step.md
progress: true

Implement one increment only from plan-step.md using recon-step.md evidence. Keep edits small, avoid placeholders, and run the project's own targeted checks.

## ralph-validator
reads: plan-step.md, implement-step.md
output: validate-step.md
progress: true

Confirm the increment satisfies the project's own discovered validation contract and provide strict pass/fail evidence with remediation guidance (or honest abstention if no contract exists).

## ralph-historian
reads: plan-step.md, implement-step.md, validate-step.md
output: history-step.md
progress: true

Update @.pi/ralph/plan.md and @.pi/ralph/runbook.md based on results. Keep priority order clear and document durable learnings only.