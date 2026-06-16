# 2026-06-16-002 — Discipline gate: enforcement for ambient slopbending discipline

## Context

The June 16 refactor (decision 001 / commit `d1d006a`) made engineering
discipline *ambient* — `search-before-write`, `validation-discovery`,
`careful-actions` etc. are injected as skill guidance on every relevant turn.
But ambient guidance is "the model was told," not "the model was stopped."
There was no hard-gating mechanism: a write could proceed even if
search-before-write was skipped, and nothing forced a quality pass when the
agent believed it had satisfied a request.

Inspiration: the `bash-guard` extension's "council of reviewers" UI, which
surfaces a verdict and requires interaction before a guarded action proceeds.

## Decision

Add a guardian extension `pi/agent/extensions/discipline-gate.ts`
(`GuardianExtensionCore`) that enforces discipline at tool-call time, plus a
generalized quality reviewer triggered at task-completion granularity.

### Enforcement levels (per Jordan, 2026-06-16)

| Discipline             | Level    | Mechanism                                              |
|------------------------|----------|--------------------------------------------------------|
| `search-before-write`  | CONFIRM  | Block `edit`/`write` to a file with no prior read/search in the ledger; `ctx.ui.confirm` to override |
| `careful-actions`      | CONFIRM  | Block destructive `bash` (rm -rf, force-push, reset --hard, etc.); confirm to override |
| `validation-discovery` | WARN     | Non-blocking `ctx.ui.notify` nudging a validation pass after writes |
| `worktree`             | *(omitted)* | Deliberately NOT enforced — Jordan doesn't always use worktrees; the friction isn't worth it yet |

### Quality reviewer (task-completion gate)

- A custom tool `request_review` the agent calls **when it suspects it has
  satisfied the user's original request** (subtask granularity in a Ralph
  loop, or end of any authoring task). There is no native pi "done" event, so
  the trigger must be agent-driven.
- `request_review` records the completion signal and returns a directive
  instructing the agent to dispatch the existing `reviewer` subagent
  (`pi/agent/subagents/reviewer.md`) over the changed files — rather than
  reimplementing review logic in the extension.
- A WARN gate on commit-like `bash` (`git commit`, `gt submit/create/modify`)
  fires when no `request_review` happened in the current task window.

### Ledger

Reconstructed from `ctx.sessionManager.getEntries()`: scan assistant
`ToolCall` content + `toolResult`/`bashExecution` entries to detect whether
the target path was read (`read`) or searched (`grep`/`find`/`rg`/`ls`/`bash`
referencing the path) before a write. Stateless across restarts — the session
is the source of truth.

## Alternatives rejected

- **Hard BLOCK for search-before-write** — too brittle; legitimate new-file
  creation has nothing to read first. CONFIRM lets the human waive it.
- **Enforcing worktree** — explicitly declined by Jordan for now.
- **Extension runs the review itself via a model call** — duplicates
  `reviewer.md`, bypasses the subagent system, and bloats the gate. Rejected
  in favor of directing dispatch to the existing reviewer subagent.
- **Passive completion detection via `turn_end`** — too granular; fires every
  turn and can't distinguish "done" from "mid-task." Rejected for an explicit
  agent-invoked `request_review` tool.

## Validation

- `node pi/agent/scripts/validate-taxonomy.mjs`
- Extension is type-checked by pi at load time (no in-repo `tsc`).
- Wired into `nix/home/pi.nix` (`profileSharedPackages` + `home.file` symlink).
