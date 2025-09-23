# Jordan's Dotfiles

A declarative macOS development environment managed with **nix-darwin**.

## 🚀 Quick Start

### Prerequisites

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

The install script will build and activate your entire development environment!

## 📁 Project Structure

```
dotfiles/
├── flake.nix              # Main nix-darwin configuration
├── nix/modules/           # Modular configuration files
│   ├── git.nix            # Git configuration
│   ├── vim.nix            # Vim configuration  
│   ├── neovim.nix         # Neovim (LazyVim) configuration
│   ├── zellij.nix         # Zellij terminal multiplexer
│   └── ghostty.nix        # Ghostty terminal emulator
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
darwin-rebuild switch --flake .#Jordans-MacBook-Pro
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
darwin-rebuild build --flake .#Jordans-MacBook-Pro
```

### Adding new configuration modules
1. Create `nix/modules/your-module.nix`
2. Add to `imports` in `flake.nix`
3. Rebuild and switch

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

