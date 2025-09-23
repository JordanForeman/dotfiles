# Nix-Darwin Usage Guide

Quick reference for managing your nix-darwin development environment.

## 🏃‍♂️ Common Commands

### Basic Operations
```bash
# Build configuration (test without applying)
darwin-rebuild build --flake .#Jordans-MacBook-Pro

# Build and activate configuration  
darwin-rebuild switch --flake .#Jordans-MacBook-Pro

# Show what would change without applying
darwin-rebuild build --flake .#Jordans-MacBook-Pro --dry-run
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

### System Configuration
- **Main config**: `flake.nix`
- **Modules**: `nix/modules/*.nix`
- **Packages**: Edit `environment.systemPackages` in `flake.nix`
- **GUI Apps**: Edit `homebrew.casks` in `flake.nix`

## 🔄 Workflow Examples

### Adding a New CLI Tool
1. Find the package: `nix search nixpkgs your-tool`
2. Edit `flake.nix` → add to `environment.systemPackages`
3. Apply: `darwin-rebuild switch --flake .#Jordans-MacBook-Pro`

### Adding a New GUI Application
1. Edit `flake.nix` → add to `homebrew.casks`
2. Apply: `darwin-rebuild switch --flake .#Jordans-MacBook-Pro`

### Creating a New Configuration Module
1. Create `nix/modules/your-app.nix`
2. Add import to `flake.nix`
3. Apply changes

Example module:
```nix
{ config, pkgs, ... }:

{
  # Your app configuration
  system.activationScripts.your-app.text = ''
    # Symlink config files
    ln -sf "${builtins.toString ../../.your-app-config}" ~/.your-app-config
  '';
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
vim nix/modules/git.nix    # Git module settings
darwin-rebuild switch --flake .#Jordans-MacBook-Pro
```

## 🐛 Debugging

### Build Issues
```bash
# Verbose build output
darwin-rebuild switch --flake .#Jordans-MacBook-Pro --verbose

# Show full stack traces
darwin-rebuild switch --flake .#Jordans-MacBook-Pro --show-trace

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