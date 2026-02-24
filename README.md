# Jordan's Dotfiles

Multi-platform dotfiles managed with **nix-darwin** (macOS) + **Home Manager** (macOS + Linux).

## 🚀 Quick Start

### Installation (All Systems)

1. **Install Nix** (if not already installed):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
   ```

2. **Clone and install**:
   ```bash
   git clone git@github.com:JordanForeman/dotfiles.git
   cd dotfiles
   ./install.sh
   ```

The install script **automatically detects your environment** and chooses the appropriate setup:

### 💻 Personal Machines
- **Full nix-darwin system management**
- Installs system packages, GUI applications (via Homebrew)
- Complete dotfile management with symlinks
- Requires sudo for system-level changes

### 🏢 Work-Provisioned Machines
- **Automatically detected** via work system
- **Home Manager only** (preserves existing system management)
- Layers personal dotfiles on top of existing setup
- **Zero conflicts** with work system tooling

**What work integration does:**
- ✅ Preserves work system and tooling
- ✅ Ensures proper initialization order: work config → personal config
- ✅ Installs personal productivity tools without package conflicts
- ✅ Manages personal configs (`.gitconfig`, `.aliases`, neovim, zellij, etc.)
- ✅ Creates layered shell that sources work tools first, then personal config

## 📁 Project Structure

```
dotfiles/
├── flake.nix              # Flake entrypoint
├── nix/home/              # Home Manager modules
├── .config/               # Application configurations
│   ├── nvim/              # Neovim LazyVim setup
│   ├── zellij/            # Zellij layouts and themes
│   └── ghostty/           # Ghostty terminal config
├── .gitconfig             # Git configuration
├── .vimrc                 # Vim configuration
├── .zshrc                 # Zsh shell configuration  
└── .aliases               # Shell aliases
```

## 🛠 What's Managed

### CLI Tools (via Nix)
- **Core tools**: `bat`, `eza`, `ripgrep`, `fd`, `delta`, `gh`, `neovim`, `lazygit`
- **Development**: `gnupg`, `openssl`, `pandoc`, `zellij`
- **Network**: `tor`, `colima`

### GUI Applications (via Homebrew Casks)
- **Development**: VSCode, Ghostty
- **Productivity**: Obsidian, 1Password, Discord
- **Browsers**: Brave Browser  
- **Media**: VLC, Zoom
- **Database**: DBeaver Community
- **VPN**: ProtonVPN

### Configuration Files
- **Git**: `.gitconfig` with delta integration
- **Shell**: Custom zsh with Oh My Zsh, aliases, and prompt
- **Editors**: Both Vim (`.vimrc`) and Neovim (LazyVim setup)
- **Terminal**: Ghostty configuration with Mac-friendly keybindings
- **Multiplexer**: Zellij with custom layouts and themes

## 📝 Making Changes

### Editing Configuration Files
Configuration files are **symlinked** from their original locations, so you can edit them directly:

```bash
# Edit any config file in place - changes are immediate
vim .gitconfig
vim .vimrc  
vim .config/nvim/init.lua
vim .config/ghostty/config
```

### Adding/Removing Software

Edit `flake.nix` to modify packages or applications:

```nix
# Add CLI tools here
environment.systemPackages = with pkgs; [
  # Add new packages
  your-new-package
];

# Add GUI applications here  
homebrew.casks = [
  # Add new applications
  "your-new-app"
];
```

### Applying Changes

After making changes, rebuild and switch:

```bash
darwin-rebuild switch --flake .#personal-macbook
```

## 🏗 Architecture 

This setup uses **nix-darwin** for declarative macOS system management:

- **Reproducible**: Entire environment defined in code
- **Modular**: Configuration split into focused modules  
- **Flexible**: Edit configs in their native formats
- **Clean**: Automatic cleanup of undeclared software

### Benefits
- ✅ **Version controlled** development environment
- ✅ **Easy machine setup** - just run `./install.sh`
- ✅ **Consistent software** across environments
- ✅ **Native config editing** - no special syntax required
- ✅ **Automatic cleanup** - removes unused software

## 🔧 Advanced Usage

### Building without switching
```bash
darwin-rebuild build --flake .#personal-macbook
```

### Adding new Home Manager modules
1. Create `nix/home/your-module.nix`
2. Add it to the appropriate `imports` list in `flake.nix`
3. Rebuild/switch

### Language Version Management
Currently using traditional tools (asdf/nvm/chruby). Nix alternatives available for future migration.

## 🚨 Troubleshooting

### Nix not found
Restart your shell or source the nix profile:
```bash
source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
```

### Build failures
Check that all files are committed to git (nix flakes only see tracked files).

### Permission issues  
Make sure you're running as the correct user - nix-darwin uses `system.primaryUser = "jordan"`.

---

**Previous workflow**: Individual shell scripts for each component  
**Current workflow**: Single declarative configuration with `darwin-rebuild`
