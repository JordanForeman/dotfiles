# WorkflowEngine Design Notes

> **Status**: Reference document. The engine is implemented in `workflow-engine.ts`. This document captures the design rationale and architecture decisions. For usage instructions, see `README.md` in this directory and `extensions/workflows/README.md`.

## Problem

Workflows today are either:
1. Fully custom extensions (ralph-loop.ts — 680 lines, reimplements all coordination)
2. Inert JSON files nobody reads (orchestrations/*.json)
3. Prose instructions in prompt bodies ("do step 1, then step 2...")

We need a shared engine that handles the common mechanics so workflow extensions can focus on **what** happens, not **how** to coordinate it.

## Execution Model: Hybrid (Engine + LLM)

The engine manages lifecycle and state. The LLM executes phases by calling the `subagent` tool.

**Why hybrid?**
- Extensions can't call tools directly — only the LLM can invoke `subagent`
- `pi.sendUserMessage()` is fire-and-forget — no return value, no await
- The LLM is naturally good at interpreting results and adapting tasks
- The engine is good at deterministic state, UI updates, and enforcing structure

```
                     ┌──────────────────────────┐
                     │     WorkflowEngine        │
                     │  (extension-core)          │
                     │                            │
                     │  • Phase state machine     │
                     │  • Context accumulation    │
                     │  • UI status/progress      │
                     │  • Transition enforcement  │
                     └──────────┬─────────────────┘
                                │
                   injects structured phase
                   instructions into system prompt
                   + tracks progress via events
                                │
                     ┌──────────▼─────────────────┐
                     │       Main LLM              │
                     │                              │
                     │  Sees: "You are in phase X   │
                     │  of workflow Y. Execute by    │
                     │  calling the subagent tool    │
                     │  with agent Z and task W."    │
                     │                              │
                     │  Calls: subagent tool         │
                     │  Reports: phase results       │
                     └──────────┬─────────────────┘
                                │
                     ┌──────────▼─────────────────┐
                     │    pi-subagents (engine)     │
                     │  (community plugin)          │
                     │                              │
                     │  Executes subagent in         │
                     │  isolated sub-session         │
                     └─────────────────────────────┘
```

### How phases advance

1. **Engine** sets up workflow state and injects phase instructions via `before_agent_start`
2. **LLM** reads phase instructions, calls `subagent` tool with the right agent + task
3. **Engine** listens for `tool_execution_end` events where `toolName === "subagent"` to detect phase completion
4. **Engine** captures the subagent result, updates context, transitions to next phase
5. **Engine** sends a follow-up message with next phase instructions via `pi.sendUserMessage()`
6. Repeat until workflow completes

### What if pi-subagents goes away?

The engine's instructions tell the LLM to use the `subagent` tool. If the execution layer changes:
- Update the phase instruction template to reference the new tool/command
- Update the event listener that detects completion
- Workflow definitions don't change at all

## Architecture

```
User ──/tdd──▶ Prompt ──triggers──▶ WorkflowExtension ──uses──▶ WorkflowEngine
                                          │                          │
                                    declares phases,           manages lifecycle,
                                    transitions,               injects instructions,
                                    subagent mapping           tracks via events,
                                                               updates UI
```

### What the engine owns (mechanics)
- System prompt injection for current phase instructions
- Event-based phase completion detection
- Phase lifecycle (enter → LLM executes → exit, with status tracking)
- Context accumulation (phase results flow to subsequent phases)
- UI affordances (status bar, phase progress, notifications)
- Transition enforcement (advance / conditional / loop)

### What each workflow extension owns (intent)
- Phase definitions and ordering
- Which subagent(s) run in each phase
- Transition logic (always advance? conditional? loop?)
- Task formulation templates
- Command registration (e.g., `/tdd`)

## Core Types

```typescript
/** How a phase executes its tasks */
type PhaseExecution = "sequential" | "parallel";

/** What happens after a phase completes */
type TransitionRule =
  | { type: "advance" }
  | { type: "conditional"; decide: (results: PhaseResult, context: WorkflowContext) => string | null }
  | { type: "loop"; until: (results: PhaseResult, context: WorkflowContext, iteration: number) => boolean }

/** A single unit of work within a phase */
interface PhaseTask {
  agent: string;           // subagent name
  task: string;            // instruction template (supports {input}, {context}, {phase:red}, etc.)
  skill?: string[];        // optional skills to inject
}

/** Definition of one workflow phase */
interface PhaseDefinition {
  id: string;              // unique within this workflow
  label: string;           // human-readable, shown in UI
  execution: PhaseExecution;
  tasks: PhaseTask[] | ((context: WorkflowContext) => PhaseTask[]);
  transition: TransitionRule;
}

/** Result from executing a phase */
interface PhaseResult {
  phaseId: string;
  status: "completed" | "failed" | "skipped";
  outputs: TaskOutput[];
  durationMs: number;
}

/** Output from a single task dispatch */
interface TaskOutput {
  agent: string;
  result: string;          // subagent's response text
  status: "success" | "error";
}

/** Accumulated state across phases — the engine's runtime memory */
interface WorkflowContext {
  /** The original user input that triggered the workflow */
  input: string;
  /** All phase results so far, keyed by phase id */
  phases: Record<string, PhaseResult>;
  /** Structured findings summary — injected as {context} in task templates */
  findings: string;
  /** Current phase id */
  currentPhase: string | null;
  /** Workflow-specific state (extensions can store arbitrary data) */
  state: Record<string, unknown>;
}

/** Full workflow definition — provided by each workflow extension */
interface WorkflowDefinition {
  id: string;              // e.g. "tdd", "triage", "feature-pipeline"
  name: string;            // human-readable
  description: string;
  phases: PhaseDefinition[];
  /** Optional: custom context initialization */
  initialize?: (input: string) => Partial<WorkflowContext>;
  /** Optional: format context for injection into task templates */
  formatContext?: (context: WorkflowContext) => string;
}
```

## Engine Lifecycle

```typescript
class WorkflowEngine {
  private context: WorkflowContext;
  private definition: WorkflowDefinition;
  private pi: ExtensionAPI;

  constructor(pi: ExtensionAPI, definition: WorkflowDefinition) { ... }

  // ── Public API (called by workflow extensions) ──

  /** Start the workflow. Registers event listeners and injects first phase. */
  start(input: string, ctx: ExtensionCommandContext): void

  /** Get current workflow state (for UI, status commands, etc.) */
  getStatus(): { phase: string | null; context: WorkflowContext }

  // ── Event handlers (registered internally) ──

  /** before_agent_start: inject current phase instructions into system prompt */
  private onBeforeAgentStart(event, ctx): BeforeAgentStartEventResult

  /** tool_execution_end: detect subagent completion, capture result */
  private onToolExecutionEnd(event): void

  /** agent_end: phase complete — evaluate transition, advance or finish */
  private onAgentEnd(event, ctx): void

  // ── Phase management ──

  /** Build the system prompt addition for the current phase */
  private buildPhaseInstructions(): string

  /** Transition to the next phase based on transition rules */
  private advancePhase(): void

  /** Update UI status bar and notifications */
  private updateUI(ctx: ExtensionContext): void
}
```

### Phase instruction injection

When the engine is active, it adds a block to the system prompt via `before_agent_start`:

```markdown
## Active Workflow: Test-Driven Development

**Current phase: 🔴 Write failing tests** (phase 1 of 3)

Execute this phase by using the `subagent` tool:
- Agent: `testing-reviewer`
- Task: "Write failing tests that specify the intended behavior for: [user's input]. Do NOT write implementation code. Tests should fail clearly."

After the subagent completes, report the outcome. The workflow engine will advance to the next phase.

**Do not skip phases or execute future phases prematurely.**
```

### Phase completion detection

The engine listens for `tool_execution_end` events:

```typescript
pi.on("tool_execution_end", (event) => {
  if (event.toolName !== "subagent") return;
  if (!this.context.currentPhase) return;

  // Extract result from the subagent tool's output
  const output = extractSubagentResult(event.result);

  // Record phase result
  this.context.phases[this.context.currentPhase] = {
    phaseId: this.context.currentPhase,
    status: event.isError ? "failed" : "completed",
    outputs: [{ agent: "...", result: output, status: event.isError ? "error" : "success" }],
    durationMs: /* tracked from phase start */,
  };

  // Update accumulated findings
  this.context.findings = this.formatFindings();
});
```

After the agent turn ends (`agent_end`), the engine evaluates the transition rule and either:
- Sends the next phase's instructions via `pi.sendUserMessage()`
- Notifies completion if the workflow is done

## Example: TDD Workflow Extension

```typescript
// pi/agent/extensions/workflows/tdd.ts

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { WorkflowEngine, type WorkflowDefinition } from "../../extension-core/workflow-engine";
import { WorkflowExtensionCore } from "../../extension-core/workflow-extension-core";

const TDD_WORKFLOW: WorkflowDefinition = {
  id: "tdd",
  name: "Test-Driven Development",
  description: "Red-green-refactor cycle for implementing features with tests first",
  phases: [
    {
      id: "red",
      label: "🔴 Write failing tests",
      execution: "sequential",
      tasks: [{
        agent: "testing-reviewer",
        task: "Write failing tests that specify the intended behavior for: {input}. Do NOT write implementation code. Tests should fail when run.",
      }],
      transition: { type: "advance" },
    },
    {
      id: "green",
      label: "🟢 Make tests pass",
      execution: "sequential",
      tasks: [{
        agent: "builder",
        task: "Write the minimal implementation to make the failing tests pass. Do not over-engineer.\n\nTest phase output:\n{phase:red}",
      }],
      transition: { type: "advance" },
    },
    {
      id: "refactor",
      label: "🔵 Review & refactor",
      execution: "sequential",
      tasks: [{
        agent: "reviewer",
        task: "Review the implementation for clarity and design. Refactor if needed. Ensure tests still pass.\n\nFull context:\n{context}",
      }],
      transition: { type: "advance" },
    },
  ],
};

class TddExtension extends WorkflowExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, { id: "tdd", name: "TDD Workflow", summary: "Red-green-refactor cycle" });
  }

  protected registerExtension(): void {
    const engine = new WorkflowEngine(this.pi, TDD_WORKFLOW);

    this.pi.registerCommand("tdd", {
      description: "Start a TDD workflow: write tests, implement, refactor",
      handler: async (args, ctx) => {
        if (!args.trim()) {
          ctx.ui.notify("Usage: /tdd <what to implement>", "error");
          return;
        }
        engine.start(args.trim(), ctx);
      },
    });
  }
}

export default function tdd(pi: ExtensionAPI) {
  new TddExtension(pi).register();
}
```

## Example: Triage Workflow Extension

```typescript
// pi/agent/extensions/workflows/triage.ts

const TRIAGE_WORKFLOW: WorkflowDefinition = {
  id: "triage",
  name: "Incident Triage",
  description: "Parallel investigation with convergent synthesis",
  phases: [
    {
      id: "investigate",
      label: "🔍 Parallel investigation",
      execution: "parallel",
      tasks: [
        { agent: "code-explorer", task: "Examine source code paths related to: {input}" },
        { agent: "log-viewer", task: "Search logs, traces, and error patterns for: {input}" },
        // Each track runs as a separate subagent in parallel
      ],
      transition: { type: "advance" },
    },
    {
      id: "synthesize",
      label: "📋 Synthesize findings",
      execution: "sequential",
      tasks: [{
        agent: "architect",
        task: "Synthesize all investigation findings into:\n1. Root cause analysis\n2. Confidence level\n3. Recommended next steps\n\nIf critical gaps remain, end your response with NEEDS_FURTHER_INVESTIGATION and specify what to look for.\n\nFindings:\n{context}",
      }],
      transition: {
        type: "conditional",
        decide: (results, _context) => {
          const output = results.outputs[0]?.result ?? "";
          return output.includes("NEEDS_FURTHER_INVESTIGATION") ? "investigate" : null;
        },
      },
    },
  ],
};
```

## Composability

A workflow can be embedded as a phase in another workflow:

```typescript
const featureWorkflow: WorkflowDefinition = {
  id: "feature",
  name: "Feature Delivery",
  description: "Plan, implement with TDD, review",
  phases: [
    {
      id: "plan",
      label: "📋 Plan",
      execution: "sequential",
      tasks: [{ agent: "architect", task: "Create implementation plan for: {input}" }],
      transition: { type: "advance" },
    },
    {
      id: "implement",
      label: "🔨 Implement (TDD)",
      execution: "sequential",
      // Nested workflow — the engine recognizes a workflow reference and delegates
      tasks: [{ agent: "tdd", task: "{phase:plan}" }],
      // OR: the engine supports a `workflow` field on PhaseDefinition
      transition: { type: "advance" },
    },
    {
      id: "ship",
      label: "🚀 Ship",
      execution: "sequential",
      tasks: [{ agent: "git-ops", task: "Stage, commit, and push the implemented changes.\n\n{context}" }],
      transition: { type: "advance" },
    },
  ],
};
```

**Open question**: Should nested workflows be:
- **Inline** (the outer engine runs the inner workflow's phases as its own) — simpler but flattens the hierarchy
- **Delegated** (the outer engine dispatches to the inner workflow engine) — preserves encapsulation but adds coordination complexity

## UI Contract

The engine provides consistent UI affordances:

```
Status bar:  🔴 TDD: Write failing tests (1/3)
             🔍 Triage: Investigating (2 tracks active)

Notifications:
  ✅ Phase "red" completed (12s)
  ▶️ Advancing to "green"
  ⚠️ Phase "green" failed — builder reported errors
  🎉 Workflow "tdd" completed (3 phases, 47s)
```

Each workflow extension can optionally customize labels and status formatting, but the engine provides sensible defaults.

## Open Questions

1. **Parallel dispatch**: For triage's parallel investigation, the LLM needs to call `subagent` multiple times (or use the parallel tasks variant). The phase instruction should guide this clearly. Does the engine detect multiple subagent calls for a parallel phase and wait for all of them?

2. **Nested workflow composability**: See inline vs delegated above.

3. **State persistence**: Should the engine support saving/restoring workflow state across sessions? Minimal value for TDD (session-scoped), but triage might benefit.

4. **Error recovery**: When a phase fails, should the engine offer retry? Skip? Or always defer to the user?

5. **Prompt binding**: The prompt's `workflow:` frontmatter declares the workflow it triggers. When the user types `/review` (a prompt), should the prompt system detect `workflow: pr-review` and route to the extension's registered command? Or should prompts and workflow commands remain separate entry points?
