# Pi Agent Configuration

This directory contains the shareable Pi configuration synced across Jordan's machines.

> For the full taxonomy, hierarchy, and development guide, see the root **AGENTS.md**.

## Structure

```text
pi/agent/
├── subagents/          # Agent definitions (synced to ~/.pi/agent/agents/)
├── prompts/            # User-facing workflow triggers (ship/analyze/plan/learn)
├── skills/             # Contextual knowledge (conventions/guides/formats/standards)
├── extension-core/     # Shared base classes + workflow engine
├── extensions/         # Always-on local extensions
│   └── workflows/      # Workflow extensions (TDD, triage, etc.)
├── optional-extensions/ # Opt-in local extensions (loaded via `-e`)
├── themes/             # UI themes
├── settings.json       # Base template (packages rendered via Nix)
└── keybindings.json
```

## Syncing & Runtime

**pi-subagents** is the community extension for agent execution:
- Installed via settings package: `npm:pi-subagents`
- Agent discovery: `~/.pi/agent/agents` (synced from `pi/agent/subagents/` by Home Manager)

### Inheritance chain (work machine)

```text
1. dotfiles/pi/agent/           # Version-controlled base
        ↓
2. ~/.pi/agent/                 # Machine base (dotfiles + local additions)
        ↓
3. ~/.pi/agent-work/            # Active profile (work overrides)
```

`agent-work/settings.json` is reconciled from machine-generated defaults, so shared package policy is defined in Nix and applied consistently.

## Making Changes

Edit inside this repo, then apply Home Manager for the target machine:

- Agent definitions: `pi/agent/subagents/*.md`
- Prompt templates: `pi/agent/prompts/{ship,analyze,plan,learn}/*.md`
- Skills: `pi/agent/skills/{guides,conventions,formats,standards}/**/SKILL.md`
- Workflow extensions: `pi/agent/extensions/workflows/*.ts`
- Extension core: `pi/agent/extension-core/**`
- Always-on extensions: `pi/agent/extensions/**`
- Themes: `pi/agent/themes/*.json`

## Ralph v2 Workflow

`/ralph:start <objective> --iterations N` runs a compact WorkflowEngine flow:

```text
ralph-groomer → ralph-worker (up to N sequential increments) → ralph-summarizer
```

The parent Pi session only schedules phases and receives compact receipts/signals. Worker internals (planning, recon, implementation, validation, and history updates) stay inside `ralph-worker` and durable `.pi/ralph/` artifacts.
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

### Latest GPT models unavailable

Use the provider that matches your auth:

- **ChatGPT subscription** → `/login` and choose **OpenAI Codex** (`openai-codex` provider)
- **OpenAI Platform API** → set `OPENAI_API_KEY` (or `auth.json` entry `openai`)

Quick checks:

```bash
pi --list-models openai-codex
pi --list-models openai
```

If `openai` requests fail with quota/billing errors, update the OpenAI Platform API key or billing/project limits.

### Work-only MCP tools not loading

Ensure machine-local files still exist under `~/.pi/agent/` (not managed by dotfiles):

- `extensions/mcp-bridge/`
- `bin/*-mcp-cli`
- `secrets/*`
