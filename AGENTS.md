# Dotfiles Repository

This repository manages Jordan’s cross-machine development environment using **nix-darwin** + **Home Manager**, plus app configs and Pi agent configuration.

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
├── pi/                       # Version-controlled Pi config source
│   ├── README.md
│   └── agent/
│       ├── subagents/           # Agent defs (synced to ~/.pi/agent/agents)
│       ├── extensions/
│       ├── prompts/
│       ├── skills/
│       └── themes/
└── AGENTS.md
```

## Editing Rules

1. Prefer small, focused, reversible changes.
2. Preserve existing style and structure in each file type (Nix, shell, Lua, TOML, JSON, Markdown).
3. Do not commit generated artifacts (`result`, backups, `node_modules`, etc.).
4. For Pi-related changes, edit `pi/` in this repo, **not** `~/.pi/` directly.
5. Avoid unrelated refactors while touching config files.

## Task-Specific Guidance

### 1) Nix / package / machine behavior changes

When changing packages, modules, or activation behavior:
- Update the appropriate file (`flake.nix`, `nix/home/*.nix`, `nix/modules/*.nix`, etc.)
- Keep changes scoped to the target platform/machine
- Validate with a build before switch when possible

Useful validation commands:

```bash
# Personal macOS
NIXPKGS_ALLOW_UNFREE=1 darwin-rebuild build --flake .#personal-macbook --impure

# Work macOS (Home Manager only)
nix run home-manager/master -- build --flake .#jordan@shopify-macbook

# Linux (example host)
home-manager build --flake .#jordan@omarchy
```

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

### 3) Pi configuration changes (subset of this repo)

Pi is one part of the repo; keep it isolated to `pi/`:
- Agents (source): `pi/agent/subagents/`
- Optional chain files: `pi/agent/subagents/*.chain.md`
- Orchestration JSON: `pi/agent/subagents/orchestrations/`
- Extensions: `pi/agent/extensions/`
- Skills: `pi/agent/skills/`
- Prompts: `pi/agent/prompts/`
- Themes: `pi/agent/themes/`

If changing Pi architecture/docs, also update:
- `pi/README.md`
- any relevant README files under `pi/agent/`

### The Prompt → Subagent → Skill Hierarchy

Pi's agent system has three layers that form a natural hierarchy:

```
Prompts (Intent)       "What should happen"    /review, /plan, /quick-pr
  │
Subagents (Execution)  "Who does it"           pr-triage, architect, git-ops
  │
Skills (Knowledge)     "How to do it well"     safety, debugging, clean-code
```

- **Prompts** are user-facing workflow triggers. They declare which subagents they orchestrate.
- **Subagents** are isolated specialists that execute focused tasks within a workflow.
- **Skills** are contextual knowledge injected into any agent via the prompt-composer extension.

### 4) Prompts

Prompts are reusable workflow triggers invoked by the user (e.g. `/plan`, `/review`). They live under `pi/agent/prompts/` and are organized by **workflow intent**:

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
workflow: orchestration-name    # optional: links to subagents/orchestrations/*.json
subagents: [agent-a, agent-b]   # optional: subagents this prompt may invoke
---

Prompt body with workflow instructions.
```

Prompts should NOT use skills' pedagogical categories (`guides/conventions/formats/standards`). The validator guards against this.

### 5) Skills

Skills are the unified system for contextual knowledge. They live under `pi/agent/skills/` and are organized by **pedagogical type** (what the skill teaches the agent):

| Category | Purpose | Example |
|---|---|---|
| `conventions/` | Rules: specific constraints to follow | `typescript`, `safety`, `git-ops` |
| `guides/` | Methodology: how to approach a class of problem | `debugging`, `refactoring`, `figma-design` |
| `formats/` | Structure: templates for structured output | |
| `standards/` | Taste: opinionated quality bars; what "good" looks like | `clean-code`, `concise-output`, `frontend-aesthetics` |

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
- `detect` — injected when environment heuristics match. Declarative rules in frontmatter:
  - `files: [...]` — any listed file exists in cwd
  - `platform: darwin|linux|win32` — OS match
  - `dependencies: [...]` — any listed dep in package.json
  - `mode: read-only` — restricted toolset detected
- `classify` — injected when an LLM classifier deems the skill relevant to the user's prompt
- `explicit` — never auto-injected; loaded on demand by Pi's native skill system when referenced by name

The `prompt-composer` extension discovers all non-explicit skills automatically by walking the skills tree and reading frontmatter. **Adding a new skill = adding a directory with a SKILL.md. No extension code changes needed.**

Do NOT create a `system-fragments/` directory — this is a legacy concept. All contextual knowledge belongs in skills.

Validate structure with:

```bash
node pi/agent/scripts/validate-taxonomy.mjs
```

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
