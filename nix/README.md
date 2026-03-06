# Nix Module Conventions

## Reconciliation Strategy

Some files in this repo are intentionally **immutable** (symlinked to dotfiles), while
others must remain **writable** on-machine. We use explicit reconciliation patterns so
`home-manager switch` is safe and predictable.

### Policies

1. **immutable**
   - Managed with `home.file` symlinks.
   - Source of truth is this repo.
   - Use for stable, fully-versioned config.

2. **seed-once**
   - Copy file from repo only when target is missing.
   - Local file is then user-owned.

3. **merge-missing**
   - Structured merge (JSON): add missing keys from repo template.
   - Never overwrite existing local values.
   - Good for runtime-mutated settings files.

4. **tracked-mutable**
   - Keep writable live file + `.dotfiles-base` reference copy.
   - Warn on drift; do not auto-overwrite local edits.

5. **append-local-hook**
   - Repo-managed base file sources a local optional file (for machine-specific logic).
   - Preferred for shell/profile text files.

## Current Mapping

- `~/.pi/agent/settings.json` → **merge-missing**
  - Implemented via `nix/scripts/reconcile-json-defaults.py`
- `~/.pi/agent-*/settings.json` → **merge-missing + list normalization**
  - Implemented via `nix/scripts/reconcile-pi-profile-settings.py`
- `~/.gitconfig` (Shopify machine) → **tracked-mutable**
  - Implemented via `nix/scripts/reconcile-gitconfig.sh`
- `~/.zshrc` → **immutable + append-local-hook**
  - Base from dotfiles, machine-local additions in `~/.zshrc.local`

## Rule of Thumb

Default to **immutable**. Only use reconciliation when a file must remain writable
for runtime updates or machine-local edits.
