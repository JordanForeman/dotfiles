# Pi Agent Configuration

This directory contains the **shareable** base configuration for Pi agents across machines.

## 🏗️ Structure

```
pi/agent/
├── subagents/          # Subagent definitions (converted from agents/)
│   ├── *.md           # Subagent specifications (runtime-discovered)
│   └── orchestrations/ # Orchestration configs
├── prompts/            # General development prompts (9 generic + 5 work-specific prompts)
├── skills/             # Reusable skills (1 generic + 4 work-specific skills)
├── extensions/         # Shareable Pi extensions
│   ├── subagents/     # Robust subagents extension
│   ├── theme-switcher.ts
│   ├── ui-modern.ts   # Default modern session UI (enhanced footer indicators)
│   └── safety-gate.ts
├── themes/             # Pi UI themes
├── settings.json       # Base settings template
├── keybindings.json    # Keyboard shortcuts
└── AGENTS.md           # Documentation
```

## 🔄 Inheritance Chain (Work Machine)

When running Pi on a work-provisioned machine:

```
1. dotfiles/pi/agent/          # Base (version controlled, shareable)
        ↓
2. ~/.pi/agent/                # Machine base (dotfiles + local additions)
   ├── subagents/ → dotfiles symlink
   ├── prompts/ → dotfiles symlink
   ├── skills/ → dotfiles symlink
   ├── extensions/ → dotfiles symlink + local:
   │   ├── mcp-bridge (work-only)
   │   └── qmd-reindex.ts (work-only)
   ├── bin/ (work MCP CLI wrappers)
   ├── secrets/ (credentials - not in dotfiles)
   └── models.json (work proxy config)
        ↓
3. ~/.pi/agent-work/        # Active profile (minimal overrides)
   ├── models.json             # work proxy + 1M context models
   ├── settings.json           # References ../agent/extensions/
   └── sessions/               # work sessions
```

**When you run `pi`:**
- Uses `agent-work` profile (`PI_CODING_AGENT_DIR=~/.pi/agent-work`)
- Inherits all shared content from `agent/` via `../agent/` paths
- Has access to all subagents, prompts, skills from dotfiles
- Plus work-specific extensions and MCP tools

## 🔒 Local-Only Content (Not in Dotfiles)

The following stay on the local machine and are excluded via `.gitignore`:

- `agent/secrets/` - Credentials (Slack, Google, etc.)
- `agent/bin/*-mcp-cli` - work MCP wrappers (data-portal, slack, observe)
- `agent/extensions/mcp-bridge` - work MCP bridge
- `agent/extensions/qmd-reindex.ts` - work-specific
- `agent/models.json` - work proxy configuration
- `agent-work/` - Entire work profile
- `shopify-*` files - work-specific resources
- `agent/sessions/` - Session history (can contain sensitive info)

## 🎯 Usage

### On Work Machine

```bash
# Run Pi with work profile (via devx wrapper)
pi

# This automatically:
# - Uses agent-work profile
# - Inherits from ~/.pi/agent/
# - Which includes dotfiles content via symlinks
# - Plus work-specific local extensions
```

### On Personal Machine

```bash
# Run Pi with standard profile
pi

# Uses ~/.pi/agent/ directly
# Which includes dotfiles content
```

## 📝 Making Changes

### To Shared Content (Subagents, Prompts, Skills)

Edit files in `dotfiles/pi/agent/`:
```bash
cd ~/src/github.com/jordanforeman/dotfiles
# Edit pi/agent/subagents/*.md, prompts/*.md, skills/*, etc.
git commit && git push

# On machine: Re-run Home Manager
nix run home-manager/master -- switch --flake .#jordan@shopify-macbook
```

Changes will sync across all machines using these dotfiles.

### To Local Work Content

Edit files directly in `~/.pi/agent/`:
```bash
# Add/modify local extensions, MCP wrappers, etc.
# These stay on the machine and don't sync
```

## 🔧 Subagents System

The dotfiles use the **robust subagents extension** (not the outdated local one).

### Available Subagents (discovered at runtime):

**From dotfiles base:**
- `builder` - Build and test orchestration
- `git-ops` - Git operations
- `log-viewer` - Log analysis
- `planner` - Implementation planning
- `reviewer` - Code review
- `team-creator` - Creates reusable team capabilities (subagents + orchestrations + docs)

**Converted from local:**
- `architect` - Solution design
- `code-explorer` - Codebase research
- `code-explainer` - Code documentation
- `reviewer-rory`, `reviewer-derek`, `reviewer-dom`, `reviewer-regina`, `reviewer-terry` - Specialized reviewers
- `impact-reviewer-*` - Impact analysis
- `notetaker` - Meeting notes
- `markdown-author` - Documentation writing

### Usage:

```bash
# List available subagents
/subagents list

# Use a subagent
/subagent planner "Create implementation plan for feature X"

# Run orchestration
/subagents orchestrate feature-dev-pipeline "Build user authentication"

# Run multiple teams in parallel (each team gets its own git worktree)
/subagents team feature-dev-pipeline api::"Build API changes" || ui::"Build UI changes"

# Ask Pi to run an objective using teams mode
/teams do Build issue #123 with separate API and UI tracks
# (shorthand)
/teams Build issue #123 with separate API and UI tracks

# Inspect team status
/teams list

# Build reusable team capability artifacts directly
/subagents orchestrate team-creation-pipeline "Create a reusable team capability for docs automation"

# Launch a team-creation team in teams mode
/subagents team team-creation-pipeline team-factory::"Create a reusable team capability for docs automation"

# Create a reusable team capability via manager helper
/teams create "A generalist team that can take a feature request from planning to PR"
/teams create "A team that creates teams"
```

## 🆘 Troubleshooting

### Subagents not found
Check symlinks: `ls -la ~/.pi/agent/subagents/`
Should point to dotfiles.

### Extensions not loading
Check `agent-work/settings.json` has:
```json
"packages": [
  "../agent/extensions/subagent",
  "../agent/extensions/mcp-bridge"
]
```

### work MCP tools not working
Ensure local files exist:
- `~/.pi/agent/extensions/mcp-bridge/`
- `~/.pi/agent/bin/*-mcp-cli`
- `~/.pi/agent/secrets/*`

These are machine-local and not managed by dotfiles.
