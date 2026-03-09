# Pi Agent Configuration

This directory contains the shareable Pi configuration synced across Jordan's machines.

## Structure

```text
pi/agent/
├── subagents/          # Agent definitions (source of truth in this repo)
│   ├── *.md            # Agent specs (YAML frontmatter + prompt body)
│   ├── *.chain.md      # Optional reusable chains for pi-subagents
│   └── orchestrations/ # Orchestration JSON artifacts
├── prompts/            # Prompt templates
├── skills/             # Reusable skills
├── extensions/         # Local shareable extensions (pi-ask, ui, etc.)
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
- Prompt templates: `pi/agent/prompts/*.md`
- Skills: `pi/agent/skills/**`
- Local extensions: `pi/agent/extensions/*.ts`
- Themes: `pi/agent/themes/*.json`

Then apply Home Manager for the target machine.

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
