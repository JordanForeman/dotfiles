# Extension Core

Shared base classes and the workflow engine. See root **AGENTS.md §8** for the extension taxonomy and **§5** for the workflow system.

## WorkflowEngine API Reference

`workflow-engine.ts` — the shared coordination engine for workflow extensions.

### Key types

```typescript
WorkflowDefinition  // Declares phases, transitions, subagent assignments
PhaseDefinition     // One phase: id, label, execution mode, tasks, transition rule
PhaseTask           // One unit of work: agent name + task template
WorkflowContext     // Accumulated state: input, phase results, findings
```

### Phase execution modes

- `sequential` — tasks run one at a time
- `parallel` — all tasks dispatched simultaneously

### Transition rules

- `advance` — always proceed to next phase
- `conditional` — `decide(result, context)` returns next phase id or null to end
- `loop` — `until(result, context, iteration)` returns true when done

### Task template placeholders

- `{input}` — original user input
- `{context}` — formatted accumulated findings from all completed phases
- `{phase:<id>}` — output from a specific completed phase

## Design goals

- Extension entrypoints should be thin and consistent
- Workflow definitions should be pure configuration — the engine handles all mechanics
- Subagent dispatch is abstracted inside the engine (currently `pi-subagents`; swappable)
