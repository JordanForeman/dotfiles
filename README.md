# Jordan's Dotfiles

Declarative, cross-machine development environment built with:

- **nix-darwin** (personal macOS)
- **Home Manager** (work macOS + Linux)
- Native config files for apps like Neovim, Ghostty, Zellij, Git, and Zsh

This repo is the source of truth for day-to-day terminal/editor/tooling setup.

---

## What this manages

- CLI tooling (ripgrep, fd, eza, bat, gh, neovim, lazygit, etc.)
- macOS system packages and GUI apps (on personal machines)
- User-level dotfiles (`.zshrc`, `.aliases`, `.gitconfig`, app configs under `.config/`)
- Pi agent shared configuration via external `pi-agent` flake input

## What this does **not** manage

- Machine-local secrets and runtime state (for example: `~/.pi/agent/secrets`, session history)
- Work-only private tooling/config repos
- Omarchy-owned desktop stack on Linux (Hyprland/Waybar/etc.)

---

## Supported machine modes

| Environment | Configuration style | Primary target |
|---|---|---|
| Personal macOS | nix-darwin + Home Manager | `.#personal-macbook` |
| Work-provisioned macOS | Home Manager only (layered) | `.#jordan@shopify-macbook` |
| Linux (Omarchy / generic) | Home Manager | `.#jordan@omarchy` / `.#jordan@arch-pc` |

`./install.sh` auto-detects environment and chooses the right path.

---

## Quick start

### 1) Install Nix

If Nix is not installed yet, install it first.

### 2) Clone this repo

```bash
git clone git@github.com:JordanForeman/dotfiles.git
cd dotfiles
```

### 3) Run the installer

```bash
./install.sh
```

The script will:
- detect OS + host style
- build the correct flake target
- apply configuration (`darwin-rebuild` or `home-manager switch`)
- refresh the stable `~/.dotfiles` symlink used by out-of-store config links

### 4) Restart your terminal

Some shell/path changes require a new shell session.

---

## Daily workflow

### Edit config files directly

Most app configs live in-repo and are symlinked/applied by Home Manager:
The installer maintains `~/.dotfiles` as a stable pointer to the active checkout, so repo-backed config links work even when this repo lives in different directories on different machines.

```bash
$EDITOR .zshrc
$EDITOR .gitconfig
$EDITOR .config/nvim/init.lua
$EDITOR .config/ghostty/config
```

### Apply declarative changes

Use `build` first, then `switch`.

```bash
# Personal macOS
NIXPKGS_ALLOW_UNFREE=1 darwin-rebuild build --flake .#personal-macbook --impure
sudo -E darwin-rebuild switch --flake .#personal-macbook --impure

# Work macOS (layered Home Manager)
nix run home-manager/master -- build --flake .#jordan@shopify-macbook
nix run home-manager/master -- switch -b backup-before-home-manager --flake .#jordan@shopify-macbook

# Linux
home-manager build --flake .#jordan@omarchy
home-manager switch -b backup-before-home-manager --flake .#jordan@omarchy
```

---

## Repository layout

```text
dotfiles/
├── flake.nix                 # Main flake + machine definitions
├── install.sh                # Bootstrap/detection script
├── nix/
│   ├── home/                 # Home Manager modules
│   ├── modules/              # Shared module helpers
│   ├── machines/             # Machine-specific notes
│   └── pkgs/                 # Custom package defs
├── .config/                  # App configs (nvim, ghostty, zellij, etc.)
├── .zshrc / .aliases / .gitconfig
├── flake.lock                # Pins Nix inputs, including external pi-agent config
└── README.md / USAGE.md
```

---

## Pi configuration

Shared Pi config is versioned separately in `git@github.com:JordanForeman/pi-agent.git` and pinned here as the `pi-agent` flake input. Home Manager syncs that input into `~/.pi/agent`.

If you want to change shared Pi behavior, edit `~/Developer/pi-agent`, commit and push it, then update this repo's flake lock for `pi-agent`.

Fresh machines need GitHub SSH auth before Nix can fetch this private `pi-agent` input.

Do **not** edit machine-local runtime state in `~/.pi/agent` and expect it to be portable.

---

## Troubleshooting

- **Flake can't see new files**: Nix flakes only include git-tracked files. Run `git add` for new files.
- **`darwin-rebuild` not found**: ensure nix-darwin is installed/available in PATH on personal macOS.
- **Home Manager command missing**: use `nix run home-manager/master -- <cmd>`.
- **Broken repo-backed config symlinks**: rerun `./install.sh` (or update `~/.dotfiles`) so Home Manager points at the current checkout path.
- **Unexpected shell behavior**: check local overrides in `~/.zshrc.local`.

---

## Additional docs

- `USAGE.md` — command-focused reference
- `nix/README.md` — module conventions and reconciliation policies
- `nix/machines/README.md` — machine-target notes
- `~/Developer/pi-agent/README.md` — Pi-specific architecture and inheritance details
