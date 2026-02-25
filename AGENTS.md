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
│   ├── modules/              # Shared Nix modules
│   ├── machines/             # Machine docs/overrides
│   └── pkgs/                 # Custom packages
├── .config/                  # App configs (nvim, ghostty, zellij, etc.)
├── .gitconfig/.zshrc/.aliases
├── pi/                       # Version-controlled Pi config source
│   ├── README.md
│   └── agent/
│       ├── subagents/
│       ├── orchestrations/
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

### 3) Pi configuration changes (subset of this repo)

Pi is one part of the repo; keep it isolated to `pi/`:
- Subagents: `pi/agent/subagents/`
- Orchestrations: `pi/agent/subagents/orchestrations/`
- Extensions: `pi/agent/extensions/`
- Prompts/skills/themes: corresponding `pi/agent/*` folders

If changing Pi architecture/docs, also update:
- `pi/README.md`
- any relevant README files under `pi/agent/`

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
