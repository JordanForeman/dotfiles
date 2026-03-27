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
│   ├── guides/         # Method/process templates
│   ├── conventions/    # Policy/rule templates
│   ├── formats/        # Structured output templates
│   └── standards/      # Quality/taste templates
├── skills/
│   ├── guides/         # Methodology skills
│   ├── conventions/    # Rules and conventions
│   ├── formats/        # Structured operation skills
│   └── standards/      # Opinionated quality bar skills
├── extension-core/      # Shared extension base classes + UI helpers
├── extensions/          # Always-on local extensions (auto-discovered by pi)
├── optional-extensions/ # Opt-in local extensions (loaded ad-hoc via `-e`)
├── system-fragments/   # Runtime guidance fragments consumed by prompt-composer
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
- Prompt templates: `pi/agent/prompts/{guides,conventions,formats,standards}/*.md`
- Skills: `pi/agent/skills/{guides,conventions,formats,standards}/**/SKILL.md`
- Extension cores and shared helpers: `pi/agent/extension-core/**`
- Always-on extensions: `pi/agent/extensions/**`
- Ralph loop extension: `pi/agent/extensions/ralph-loop.ts`
- Ralph loop team: `pi/agent/subagents/ralph-*.md`, `pi/agent/subagents/ralph-loop.chain.md`
- Ralph orchestration artifact: `pi/agent/subagents/orchestrations/ralph-loop.json`
- Optional extensions: `pi/agent/optional-extensions/**`
- Themes: `pi/agent/themes/*.json`
- Runtime guidance fragments: `pi/agent/system-fragments/**` (including standards injected by `prompt-composer`)

Then apply Home Manager for the target machine.

## Taxonomy Conventions

Pi asset taxonomy is enforced structurally instead of a central registry.

- Prompts are categorized by directory:
  - `pi/agent/prompts/guides`
  - `pi/agent/prompts/conventions`
  - `pi/agent/prompts/formats`
  - `pi/agent/prompts/standards`
- Skills are categorized by directory:
  - `pi/agent/skills/guides`
  - `pi/agent/skills/conventions`
  - `pi/agent/skills/formats`
  - `pi/agent/skills/standards`
- Extensions use inheritance-based taxonomy via `pi/agent/extension-core`:
  - `GuardianExtensionCore`
  - `InterceptorExtensionCore`
  - `WorkflowExtensionCore`
  - `WidgetExtensionCore`
  - `IntegrationExtensionCore`
- Runtime guidance standards are encoded as system fragments (for `prompt-composer`), e.g. `pi/agent/system-fragments/standards/*`

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
