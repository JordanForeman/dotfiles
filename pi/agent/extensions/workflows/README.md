# Workflow Extensions

Multi-phase, lifecycle-managed workflows built on the shared `WorkflowEngine`. See root **AGENTS.md §5** for the full design, code template, and conventions.

## Existing workflows

| File | Command | Pattern | Phases |
|---|---|---|---|
| `tdd.ts` | `/tdd` | Sequential | 🔴 red → 🟢 green → 🔵 refactor |
| `triage.ts` | `/triage` | Parallel + conditional | 🔍 investigate → 📋 synthesize → (re-investigate if gaps) |

## Conventions

- One workflow per file
- Extend `WorkflowExtensionCore` (enforced by validator)
- Use `WorkflowEngine` for all phase coordination
- Register a primary command (`/name`) and optionally a status command (`/name:status`)
- Subagent names in tasks must match definitions in `pi/agent/subagents/*.md`
