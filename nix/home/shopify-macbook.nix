{ config, pkgs, lib, sqlit, ... }:

{
  # Shell configuration - use personal zshrc directly
  # Machine-specific initialization can be added to ~/.zshrc.local
  home.file.".zshrc".source = ../../.zshrc;

  # Terminal configuration
  xdg.configFile."ghostty" = {
    source = ../../.config/ghostty;
    recursive = true;
  };

  # Neovim - not managed by home-manager (edit directly in dotfiles)
  # Already symlinked via install script, avoids nix store hash churn

  # Override packages from common.nix to avoid conflicts with tec
  # Only include tools that complement (don't replace) work environment
  home.packages = with pkgs; [
    # Personal productivity tools that won't conflict with Shopify's
    bat
    eza
    ripgrep  
    fd
    delta
    bottom
    pandoc
    lazygit
    lazydocker
    sqlit
    zellij
  ];

  # Ensure Home Manager doesn't interfere with Shopify's PATH management
  home.sessionPath = [ ]; # Empty - let Shopify manage PATH
  
  # Personal environment variables (that don't conflict with Shopify's)
  home.sessionVariables = {
    EDITOR = "nvim";
    # Let Shopify's tools set their own vars, we'll only set personal ones
  };

  # Git configuration
  home.file.".gitconfig".source = ../../.gitconfig;
  home.file.".aliases".source = ../../.aliases;

  # Zellij configuration
  xdg.configFile."zellij" = {
    source = ../../.config/zellij;
    recursive = true;
  };

  # Pi agent configuration (shareable base)
  # Note: Local-only content (secrets, Shopify MCP wrappers) stays in ~/.pi/agent/
  home.file.".pi/agent/subagents" = {
    source = ../../pi/agent/subagents;
    recursive = true;
  };

  home.file.".pi/agent/prompts" = {
    source = ../../pi/agent/prompts;
    recursive = true;
  };

  home.file.".pi/agent/philosophy" = {
    source = ../../pi/agent/philosophy;
    recursive = true;
  };

  home.file.".pi/agent/skills" = {
    source = ../../pi/agent/skills;
    recursive = true;
  };

  # Note: Pi extensions are managed in pi.nix (imported via common.nix)

  # Pi settings template (can be customized locally)
  home.file.".pi/agent/settings-template.json" = {
    source = ../../pi/agent/settings.json;
  };

  # Pi keybindings (shareable)
  home.file.".pi/agent/keybindings.json" = {
    source = ../../pi/agent/keybindings.json;
  };

  # Pi themes (shareable)
  home.file.".pi/agent/themes" = {
    source = ../../pi/agent/themes;
    recursive = true;
  };

  # Pi documentation (shareable)
  home.file.".pi/agent/AGENTS.md" = {
    source = ../../pi/agent/AGENTS.md;
  };
}
