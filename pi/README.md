# Pi Agent Configuration

This directory contains the shareable Pi configuration synced across Jordan's machines.

## Structure

```text
pi/agent/
├── subagents/          # Agent definitions (source of truth in this repo)
│   ├── *.md            # Agent specs (YAML frontmatter + prompt body)
│   ├── *.chain.md      # Optional reusable chains for pi-subagents
│   └── orchestrations/ # Orchestration JSON artifacts
├── prompts/
│   ├── ship/          # Get code out the door (commit, PR)
│   ├── analyze/       # Understand/evaluate (review, arch, security)
│   ├── plan/          # Decide what to do (plan, triage)
│   └── learn/         # Understand concepts (interactive teaching)
├── skills/
│   ├── guides/         # Methodology: teaches how to approach a class of problem
│   ├── conventions/    # Rules: documents specific rules and constraints to follow
│   ├── formats/        # Structure: provides templates for structured output
│   └── standards/      # Taste: opinionated quality bars; what "good" looks like
├── extension-core/      # Shared extension base classes + UI helpers
├── extensions/          # Always-on local extensions (auto-discovered by pi)
├── optional-extensions/ # Opt-in local extensions (loaded ad-hoc via `-e`)
├── themes/             # UI themes
├── settings.json       # Base template (packages are rendered via Nix `pi.extensions`)
├── keybindings.json
└── AGENTS.md
```

## Subagents Infrastructure

We now use **[`pi-subagents`](https://github.com/nicobailon/pi-subagents)** as the runtime extension.

- Installed via settings package: `npm:pi-subagents`
- Runtime extension directories are managed by Home Manager activation
- Agent discovery path expected by `pi-subagents`: `~/.pi/agent/agents`

To keep this repo stable, agent files are still authored in `pi/agent/subagents/` and synced to runtime as:

- `pi/agent/subagents/*` → `~/.pi/agent/agents/*`

## Inheritance Chain (Work Machine)

```text
1. dotfiles/pi/agent/           # Version-controlled base
        ↓
2. ~/.pi/agent/                 # Machine base (dotfiles + local additions)
        ↓
3. ~/.pi/agent-work/            # Active profile (work overrides)
```

`agent-work/settings.json` is reconciled from machine-generated defaults (`~/.pi/profile-settings-defaults.json`), so shared package policy is defined in Nix and applied consistently without hardcoding profile-specific repository layout.

Because `hashline` declares a transitive runtime dependency on `diff`, Home Manager activation also bootstraps `diff@8.0.0` into the cached Pascal `hashline` extension directory when needed.

## Usage

### Core commands from pi-subagents

```bash
# Run one agent
/run planner "Create an implementation plan for X"

# Sequential handoff chain
/chain scout "map current behavior" -> planner "plan migration" -> worker "implement"

# Parallel execution
/parallel scout "scan frontend" -> scout "scan backend"

# Open agents manager UI
/agents
```

### Ralph loop workflow

```bash
# Initialize local loop artifacts (.pi/ralph/*)
/ralph:init "Deliver scoped features with validation gates"

# Start integrated flow: planning in main session + iterative subagent loops
/ralph:start -n 3 "Implement top priority increment"

# Observe/control lifecycle
/ralph:status
/ralph:pause
/ralph:resume
/ralph:stop
/ralph:report

# Override worktree safety guard only when intentional
/ralph:init --allow-main "Emergency run on primary worktree"
/ralph:start --allow-main "Emergency increment on primary worktree"
```

### Tool-level usage

```json
{ "agent": "planner", "task": "Plan feature X" }
```

```json
{
  "chain": [
    { "agent": "scout", "task": "Analyze auth flow" },
    { "agent": "planner", "task": "Plan refactor using {previous}" },
    { "agent": "worker", "task": "Implement approved plan" }
  ]
}
```

```json
{
  "tasks": [
    { "agent": "scout", "task": "Audit API layer" },
    { "agent": "scout", "task": "Audit UI layer" }
  ]
}
```

## Making Changes

For shared behavior, edit inside this repo:

- Agent definitions: `pi/agent/subagents/*.md`
- Prompt templates: `pi/agent/prompts/{ship,analyze,plan,learn}/*.md`
- Skills: `pi/agent/skills/{guides,conventions,formats,standards}/**/SKILL.md`
- Extension cores and shared helpers: `pi/agent/extension-core/**`
- Always-on extensions: `pi/agent/extensions/**`
- Ralph loop extension: `pi/agent/extensions/ralph-loop.ts`
- Ralph loop team: `pi/agent/subagents/ralph-*.md`, `pi/agent/subagents/ralph-loop.chain.md`
- Ralph orchestration artifact: `pi/agent/subagents/orchestrations/ralph-loop.json`
- Optional extensions: `pi/agent/optional-extensions/**`
- Themes: `pi/agent/themes/*.json`

Then apply Home Manager for the target machine.

## Taxonomy Conventions

Pi asset taxonomy is enforced structurally instead of a central registry.

- **Prompts** are categorized by workflow intent:
  - `pi/agent/prompts/ship` — get code out the door (commit, PR)
  - `pi/agent/prompts/analyze` — understand/evaluate (review, arch, security)
  - `pi/agent/prompts/plan` — decide what to do (plan, triage)
  - `pi/agent/prompts/learn` — understand concepts (interactive teaching)
- **Prompts** declare their orchestration surface in frontmatter:
  - `description` — what the prompt does (required)
  - `workflow` — orchestration pipeline this prompt triggers (optional)
  - `subagents` — subagents this prompt may invoke (optional, informational)
- **Skills** are categorized by pedagogical type:
  - `pi/agent/skills/guides` — methodology: teaches how to approach a class of problem
  - `pi/agent/skills/conventions` — rules: documents specific constraints to follow
  - `pi/agent/skills/formats` — structure: provides templates for structured output
  - `pi/agent/skills/standards` — taste: opinionated quality bars; what "good" looks like
- **Skills** declare an injection type in frontmatter:
  - `always` — injected every session (core guidance)
  - `detect` — injected when environment heuristics match (files, platform, dependencies, mode)
  - `classify` — injected when an LLM deems the skill relevant to the user's prompt
  - `explicit` — loaded on demand by Pi's native skill system (never auto-injected)
- **Extensions** use inheritance-based taxonomy via `pi/agent/extension-core`:
  - `GuardianExtensionCore`
  - `InterceptorExtensionCore`
  - `WorkflowExtensionCore`
  - `WidgetExtensionCore`
  - `IntegrationExtensionCore`

The `prompt-composer` extension dynamically discovers skills from `pi/agent/skills/` and injects
non-explicit skills into the system prompt based on their injection type and detection rules.

Validate taxonomy structure with:

```bash
node pi/agent/scripts/validate-taxonomy.mjs
```

Each extension should be implemented as a thin adapter over shared core behavior so UI patterns and lifecycle handling stay consistent over time.

## Troubleshooting

### Agents not found

```bash
ls -la ~/.pi/agent/agents
```

### Package not loaded

Check settings include:

```json
"packages": [
  "npm:pi-subagents"
]
```

### Work-only MCP tools not loading

Ensure machine-local files still exist under `~/.pi/agent/` (not managed by dotfiles), such as:

- `extensions/mcp-bridge/`
- `bin/*-mcp-cli`
- `secrets/*`
