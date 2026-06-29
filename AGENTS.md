# Dotfiles Repository

This repository manages Jordan's cross-machine development environment using **nix-darwin** + **Home Manager**, plus app configs and Pi agent configuration.

## Primary Goal

Keep local environments reproducible and easy to evolve across:
- Personal macOS machines (nix-darwin + Home Manager)
- Work-provisioned macOS machines (Home Manager layering)
- Linux machines (Home Manager)

## Repository Map (Source of Truth)

```text
dotfiles/
├── flake.nix                 # Main Nix entrypoint and machine definitions
├── install.sh                # Environment-aware bootstrap script
├── nix/
│   ├── home/                 # Home Manager modules (common + machine-specific)
│   ├── modules/              # Shared Nix modules (git, etc.)
│   ├── machines/             # Machine docs/overrides
│   └── pkgs/                 # Custom packages
├── .config/                  # App configs (nvim, ghostty, zellij, etc.)
├── .gitconfig/.zshrc/.aliases
├── flake.lock                # Pins external inputs, including pi-agent
└── AGENTS.md                 # ← You are here. Single source of truth.
```

External: `git@github.com:JordanForeman/pi-agent.git` owns Pi prompts, skills,
extensions, subagents, themes, settings, and keybindings. This repo consumes it
via the `pi-agent` flake input.

## Editing Rules

1. Prefer small, focused, reversible changes.
2. Preserve existing style and structure in each file type (Nix, shell, Lua, TOML, JSON, Markdown).
3. Do not commit generated artifacts (`result`, backups, `node_modules`, etc.).
4. For Pi-related changes, edit `~/Developer/pi-agent`, **not** `~/.pi/` directly.
5. Avoid unrelated refactors while touching config files.

## Session Behavior

These rules apply to all Pi sessions in this repo:

- Prefer **small, safe, incremental changes**.
- Ask before running destructive commands (`rm`, `sudo`, rewriting history, large overwrites).
- When editing files, preserve existing style and conventions.
- Prefer `rg`/`fd`/`eza` for search/listing.
- Be concise and information-dense in output.
- Use markdown with code fences for code.
- When suggesting commands, show them in a single copy/pasteable block.

### Subagent delegation

- Use specialized subagents proactively when a task aligns with one.
- For multi-phase requests, prefer workflow extensions or delegated execution through the `subagent` tool.
- Execution modes:
  - single specialist: `/run <agent> <task>` or `{ agent, task }`
  - sequential handoff: `/chain ...` or `{ chain: [...] }`
  - independent parallel tracks: `/parallel ...` or `{ tasks: [...] }`
- Use `/agents` to inspect, create, or adjust agent definitions.
- When asked to perform **git operations**, delegate to the `git-ops` subagent.
- If the request involves destructive git actions, require explicit confirmation.

## Task-Specific Guidance

### 1) Nix / package / machine behavior changes

When changing packages, modules, or activation behavior:
- Update the appropriate file (`flake.nix`, `nix/home/*.nix`, `nix/modules/*.nix`, etc.)
- Keep changes scoped to the target platform/machine
- Validate with a build before switch when possible

**Validation (build only — safe, no activation):**

```bash
# Personal macOS
NIXPKGS_ALLOW_UNFREE=1 darwin-rebuild build --flake .#personal-macbook --impure

# Work macOS (Home Manager only)
nix run home-manager/master -- build --flake .#jordan@shopify-macbook

# Linux (example host)
home-manager build --flake .#jordan@omarchy
```

**Applying changes (the switch): ALWAYS use `./install.sh`.**

Never recommend or run a manual `darwin-rebuild switch` / `home-manager switch`.
`install.sh` is the single entrypoint: it detects the platform, ensures
`~/.dotfiles` symlinks to the checkout (required for `mkOutOfStoreSymlink`
wiring), builds, then switches with the correct flags for the target machine.

```bash
./install.sh
```

**Can an agent run it unattended? Depends on the machine:**

| Machine | Switch command | sudo? | Agent-runnable |
|---|---|---|---|
| Personal macOS (nix-darwin) | `sudo -E darwin-rebuild switch` | **yes** — prompts for password | No (interactive sudo) |
| Work macOS (Home Manager) | `nix run home-manager/master -- switch` | no | Yes |
| Linux (Home Manager) | `home-manager switch` | no (switch itself) | Yes |

On a personal Mac the `darwin-rebuild switch` step needs a password, so the
agent should stop after the build and hand `./install.sh` to Jordan to run.
On the work macOS and Linux the switch needs no sudo and the agent may run
`./install.sh` directly.

### 2) Dotfile/app config changes

For tools like Neovim, Ghostty, Zellij, Git, Zsh:
- Edit files in this repo directly (`.config/...`, `.gitconfig`, `.zshrc`, etc.)
- Keep app-specific conventions intact
- If behavior depends on Home Manager wiring, verify related `nix/home/*.nix` module references

**Git Config Special Case:**
- `.gitconfig` in repo is the base config
- Personal Macs: symlinked (read-only) via `nix/modules/git.nix`
- Work Mac: copied (writable) to allow local modifications
  - Base kept at `~/.gitconfig.dotfiles-base` for drift detection
  - See `nix/machines/shopify-macbook.md` for sync workflows
  - Machine-specific overrides go in `~/.gitconfig.local` (gitignored)

### 3) Pi configuration changes (external repo)

Pi agent configuration now lives in `~/Developer/pi-agent` and is pinned into this flake via the `pi-agent` input:
- Agents (source): `~/Developer/pi-agent/agent/subagents/`
- Optional chain files: `~/Developer/pi-agent/agent/subagents/*.chain.md`
- Workflow extensions: `~/Developer/pi-agent/agent/extensions/workflows/`
- Extensions: `~/Developer/pi-agent/agent/extensions/`
- Extension core + workflow engine: `~/Developer/pi-agent/agent/extension-core/`
- Skills: `~/Developer/pi-agent/agent/skills/`
- Prompts: `~/Developer/pi-agent/agent/prompts/`
- Themes: `~/Developer/pi-agent/agent/themes/`

After changing Pi config, commit and push `~/Developer/pi-agent`, then update this repo's `pi-agent` flake input/lock.

---

## The Prompt → Workflow → Subagent → Skill Hierarchy

Pi's agent system has four layers that form a natural hierarchy:

```
Prompts (Intent)       "What should happen"    /tdd, /triage, /review, /plan
  │
Workflows (Lifecycle)  "How it's coordinated"  extensions/workflows/tdd.ts, triage.ts
  │
Subagents (Execution)  "Who does it"           testing-reviewer, builder, architect
  │
Skills (Knowledge)     "How to do it well"     safety, debugging, naming, testing
```

- **Prompts** are user-facing workflow triggers. They declare which subagents or workflows they invoke.
- **Workflows** are lifecycle-managed coordination patterns. They use the shared `WorkflowEngine` to manage phases, dispatch subagents, track progress via the UI, and accumulate context between phases. The engine abstracts the subagent execution layer (currently `pi-subagents`) so workflow definitions are pure configuration.
- **Subagents** are isolated specialists that execute focused tasks. They don't know about workflows — they receive a task and execute it.
- **Skills** are contextual knowledge injected into any agent via the prompt-composer extension.

---

### 4) Prompts

Prompts are reusable workflow triggers invoked by the user (e.g. `/plan`, `/review`). They live under `~/Developer/pi-agent/agent/prompts/` and are organized by **workflow intent**:

| Category | Purpose | Example |
|---|---|---|
| `ship/` | Get code out the door | `quick-commit`, `quick-pr` |
| `analyze/` | Understand/evaluate code | `review`, `arch`, `security-review` |
| `plan/` | Decide what to do | `plan`, `triage` |
| `learn/` | Understand concepts | `learn` |

Each prompt is a markdown file with YAML frontmatter:

```yaml
---
description: What this prompt does
workflow: tdd                      # optional: links to a workflow extension command
subagents: [agent-a, agent-b]      # optional: subagents this prompt may invoke (validated)
---

Prompt body with workflow instructions.
```

Prompts should NOT use skills' pedagogical categories (`guides/conventions/formats/standards`). The validator guards against this.

### 5) Workflow Extensions

Workflow extensions live in `~/Developer/pi-agent/agent/extensions/workflows/` and manage multi-phase, lifecycle-aware coordination. They use the shared `WorkflowEngine` from `~/Developer/pi-agent/agent/extension-core/workflow-engine.ts`.

**Execution model** (hybrid engine + LLM):
- The engine manages phase state, transitions, UI status, and context accumulation
- The LLM executes phases by calling the `subagent` tool as directed by engine-injected instructions
- The engine detects phase completion via `tool_execution_end` events and advances the workflow

**Phase execution modes:**
- `sequential` — one subagent at a time (TDD: red → green → refactor)
- `parallel` — multiple subagents simultaneously (triage: code + logs + data in parallel)

**Transition rules:**
- `advance` — always proceed to the next phase
- `conditional` — evaluate results and decide the next phase (or end)
- `loop` — repeat the current phase until a predicate is satisfied

**Task template placeholders:**
- `{input}` — original user input
- `{context}` — formatted accumulated findings from all completed phases
- `{phase:<id>}` — output from a specific completed phase

**Creating a new workflow:**

```typescript
// 1. Define the workflow — pure configuration
const MY_WORKFLOW: WorkflowDefinition = {
  id: "my-workflow",
  name: "My Workflow",
  description: "What this workflow does",
  phases: [
    {
      id: "phase-one",
      label: "📋 First phase",
      execution: "sequential",        // or "parallel"
      tasks: [{
        agent: "some-subagent",        // must exist in ~/Developer/pi-agent/agent/subagents/
        task: "Do the thing for: {input}",
      }],
      transition: { type: "advance" }, // or "conditional" or "loop"
    },
  ],
};

// 2. Create the extension class
class MyWorkflowExtension extends WorkflowExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, { id: "my-workflow", name: "My Workflow", summary: "Short summary" });
  }

  protected registerExtension(): void {
    const engine = new WorkflowEngine(this.pi, MY_WORKFLOW);
    this.pi.registerCommand("my-workflow", {
      description: "Start my workflow",
      handler: async (args, ctx) => { engine.start(args.trim(), ctx); },
    });
  }
}

// 3. Export the factory
export default function myWorkflow(pi: ExtensionAPI) {
  new MyWorkflowExtension(pi).register();
}
```

See `~/Developer/pi-agent/agent/extensions/workflows/tdd.ts` (sequential) and `triage.ts` (parallel + conditional) as examples.

Do NOT create orchestration JSON files — this is a legacy concept. The validator guards against it.

### 6) Subagents

Subagent definitions live in `~/Developer/pi-agent/agent/subagents/*.md`. They are markdown files with YAML frontmatter consumed by the `pi-subagents` community extension.

**Required frontmatter:** `name`, `description` (validated).

```yaml
---
name: planner
description: Produces implementation plans with milestones and risks
tools: read, bash, grep, find
tags: planning,architecture
---

System prompt body here...
```

`tools` must be comma-separated (`read, bash, grep`) — space-separated will not parse correctly.

At runtime, Home Manager syncs `~/Developer/pi-agent/agent/subagents/*` → `~/.pi/agent/agents/*`.

### 7) Skills

Skills are the unified system for contextual knowledge. They live under `~/Developer/pi-agent/agent/skills/` and are organized by **pedagogical type** (what the skill teaches the agent):

| Category | Purpose | Example |
|---|---|---|
| `conventions/` | Rules: specific constraints to follow | `typescript`, `safety`, `git-ops` |
| `guides/` | Methodology: how to approach a class of problem | `debugging`, `refactoring`, `figma-design` |
| `formats/` | Structure: templates for structured output | |
| `standards/` | Taste: opinionated quality bars; what "good" looks like | `naming`, `code-shape`, `api-design`, `module-structure`, `testing`, `concise-output`, `frontend-aesthetics` |

Each skill is a directory containing a `SKILL.md` with YAML frontmatter:

```yaml
---
name: skill-name          # Must match directory name
description: When/why this skill is relevant
injection: detect          # How the skill is delivered
detect:                    # Rules for injection: detect only
  files: [tsconfig.json]
---

Skill body content here.
```

**Injection types** control how the skill reaches the agent:

- `always` — injected every session (core guidance: `core`, `safety`, `tool-usage`, `engineering-focus`, `concise-output`)
- `detect` — injected when environment heuristics match (files, platform, dependencies, mode)
- `classify` — injected when an LLM classifier deems the skill relevant to the user's prompt
- `explicit` — never auto-injected; loaded on demand by Pi's native skill system when referenced by name

The `prompt-composer` package reads Pi-loaded skills and auto-injects non-explicit skills based on their frontmatter. **Adding a new skill = adding a directory with a SKILL.md. No local extension code changes needed.**

Do NOT create a `system-fragments/` directory — this is a legacy concept. All contextual knowledge belongs in skills.

### 8) Extensions

Extensions use inheritance-based taxonomy via `~/Developer/pi-agent/agent/extension-core`:

| Base class | Category | Purpose |
|---|---|---|
| `GuardianExtensionCore` | guardian | Block or gate tool calls |
| `InterceptorExtensionCore` | interceptor | Modify system prompt or messages in-flight |
| `WorkflowExtensionCore` | workflow | Manage lifecycle and state for multi-step operations |
| `WidgetExtensionCore` | widget | Render custom UI components |
| `IntegrationExtensionCore` | integration | Connect to external services |

Each extension should be a thin adapter over shared core behavior so UI patterns and lifecycle handling stay consistent.

---

## Validation

```bash
cd ~/Developer/pi-agent && node agent/scripts/validate-taxonomy.mjs
```

This enforces: prompt categories, skill structure/frontmatter, subagent frontmatter, cross-references (prompt `subagents:` → real agents), extension base classes, and legacy directory guards.

## Git & Worktree Workflow

- Respect worktree conventions in `~/Work`.
- Avoid doing feature work in a `main` worktree unless explicitly requested.
- Keep commits focused and descriptive (conventional commits preferred).
- For git operations (stage/commit/rebase/push), delegate to the `git-ops` subagent.

## Safety

- Ask before destructive actions (`rm`, history rewrites, large overwrites, `sudo` with risky side effects).
- Prefer root-cause fixes over bypasses.
- If unsure which layer owns a setting (app config vs Home Manager vs system), inspect first, then change.

## Decision Rule of Thumb

When making changes, prioritize this order:
1. Correct layer (app config vs Nix module vs Pi config)
2. Minimal diff
3. Reproducibility across machines
4. Clear validation path
