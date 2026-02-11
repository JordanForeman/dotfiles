# Usage Guide

Quick reference for managing your macOS (nix-darwin) and Linux (Home Manager) environment.

## 🏃‍♂️ Common Commands

### Basic Operations
```bash
# Build configuration (test without applying)
darwin-rebuild build --flake .#personal-macbook

# Build and activate configuration
darwin-rebuild switch --flake .#personal-macbook

# Show what would change without applying
darwin-rebuild build --flake .#personal-macbook --dry-run
```

### Package Management
```bash
# Search for packages
nix search nixpkgs package-name

# List installed packages
nix-env -q

# Show package information
nix-env -qa --description package-name
```

### System Information
```bash
# Show current system generation
darwin-version

# List available generations  
sudo nix-env --list-generations -p /nix/var/nix/profiles/system

# Rollback to previous generation
sudo nix-env --rollback -p /nix/var/nix/profiles/system
sudo launchctl load -w /Library/LaunchDaemons/org.nixos.nix-daemon.plist
```

## 📁 File Organization

### Configuration Files
- **Edit directly**: `.gitconfig`, `.vimrc`, `.zshrc`, `.aliases`
- **Neovim**: `.config/nvim/` directory
- **Zellij**: `.config/zellij/` directory  
- **Ghostty**: `.config/ghostty/config`

### Configuration
- **Main config**: `flake.nix`
- **Home Manager modules**: `nix/home/*.nix`
- **macOS GUI apps**: `homebrew.casks` in `flake.nix`

## 🔄 Workflow Examples

### Adding a New CLI Tool
1. Find the package: `nix search nixpkgs your-tool`
2. Edit `nix/home/common.nix` → add to `home.packages`
3. Apply using the commands below

### Adding a New GUI Application (macOS)
1. Edit `flake.nix` → add to `homebrew.casks`
2. Apply: `darwin-rebuild switch --flake .#personal-macbook`

### Creating a New Home Manager Module
1. Create `nix/home/your-module.nix`
2. Add import to `flake.nix`
3. Apply changes

Example module:
```nix
{ config, pkgs, ... }:

{
  # Your app configuration
  home.file.".your-app-config".source = ../../.your-app-config;
}
```

### Editing Configurations
```bash
# Edit configs directly - changes are immediate via symlinks
vim .gitconfig        # Git settings
vim .vimrc           # Vim settings  
vim .config/nvim/init.lua  # Neovim settings

# For nix-managed settings, edit flake then rebuild
vim flake.nix        # System packages/apps
darwin-rebuild switch --flake .#personal-macbook
```

## 🐛 Debugging

### Build Issues
```bash
# Verbose build output
darwin-rebuild switch --flake .#personal-macbook --verbose

# Show full stack traces
darwin-rebuild switch --flake .#personal-macbook --show-trace

# Check if files are tracked by git
git status
git add . && git commit -m "Add new files"
```

### Path Issues
```bash
# Check if nix paths are in PATH
echo $PATH | tr ':' '\n' | grep nix

# Reload shell environment
exec $SHELL

# Manual nix daemon reload  
sudo launchctl unload /Library/LaunchDaemons/org.nixos.nix-daemon.plist
sudo launchctl load /Library/LaunchDaemons/org.nixos.nix-daemon.plist
```

### Homebrew Integration
```bash
# Check homebrew status
brew doctor

# Manual homebrew cleanup (if needed)
brew cleanup --prune=all

# View what nix-darwin manages via homebrew
brew list --cask | grep -E "visual-studio-code|ghostty|discord"
```

## 🎯 Tips & Best Practices

1. **Always commit changes**: Nix flakes only see git-tracked files
2. **Test before switching**: Use `build` before `switch` to catch errors
3. **Keep modules focused**: One concern per module file
4. **Use native config formats**: Don't embed configs in nix strings when possible
5. **Leverage symlinks**: Let nix-darwin symlink your existing config files

## 📚 Useful Resources

- [Nix-Darwin Options](https://daiderd.com/nix-darwin/manual/index.html)
- [NixOS Package Search](https://search.nixos.org/packages)
- [Homebrew Cask Search](https://formulae.brew.sh/cask/)
- [Nix Language Basics](https://nixos.org/guides/nix-language.html)
