{ config, pkgs, lib, sqlit, piAgent, ... }:

let
  dotfiles = "${config.home.homeDirectory}/.dotfiles";
  piAgentRoot = piAgent + "/agent";
  chainFiles = pkgs.runCommand "pi-agent-chains" { } ''
    mkdir -p "$out"
    cd ${piAgentRoot}/subagents
    find . -type f -name '*.chain.md' | while IFS= read -r file; do
      mkdir -p "$out/$(dirname "$file")"
      ln -s "${piAgentRoot}/subagents/$file" "$out/$file"
    done
  '';
in
{
  # Shell configuration - use personal zshrc directly
  # Machine-specific initialization can be added to ~/.zshrc.local
  home.file.".zshrc".source = ../../.zshrc;

  # Terminal configuration
  # Use out-of-store symlink sources so config targets don't become store-hash symlinks.
  xdg.configFile."ghostty".source = config.lib.file.mkOutOfStoreSymlink "${dotfiles}/.config/ghostty";

  # AeroSpace is macOS-only
  xdg.configFile."aerospace".source = config.lib.file.mkOutOfStoreSymlink "${dotfiles}/.config/aerospace";


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
    NVIM_RUBY_USE_PROJECT_TOOLS = "1";
    EDITOR = "nvim";
    # Let Shopify's tools set their own vars, we'll only set personal ones
  };

  # Git configuration - seeded from dotfiles but kept writable
  home.activation.reconcileGitConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    ${pkgs.bash}/bin/bash ${../scripts/reconcile-gitconfig.sh} ${../../.gitconfig}
  '';

  home.file.".aliases".source = ../../.aliases;

  # Pi agent configuration (shareable base)
  # Note: Local-only content (secrets, Shopify MCP wrappers) stays in ~/.pi/agent/
  home.file.".pi/agent/agents" = {
    source = piAgentRoot + "/subagents";
    recursive = true;
  };

  # The work Mac runs the `agent-shopify` profile (PI_CODING_AGENT_DIR points at
  # ~/.pi/agent-shopify). pi-subagents discovers custom agents from
  # <PI_CODING_AGENT_DIR>/agents, so the base ~/.pi/agent/agents sync above is
  # invisible to that profile.
  home.file.".pi/agent-shopify/chains" = {
    source = chainFiles;
    recursive = true;
  };

  home.file.".pi/agent/prompts" = {
    source = piAgentRoot + "/prompts";
    recursive = true;
  };


  home.file.".pi/agent/skills" = {
    source = piAgentRoot + "/skills";
    recursive = true;
  };

  # Note: Pi extensions are managed in pi.nix (imported via common.nix)

  # Pi settings template (can be customized locally)
  home.file.".pi/agent/settings-template.json" = {
    source = piAgentRoot + "/settings.json";
  };

  # Pi keybindings (shareable)
  home.file.".pi/agent/keybindings.json" = {
    source = piAgentRoot + "/keybindings.json";
  };

  # Pi themes (shareable)
  home.file.".pi/agent/themes" = {
    source = piAgentRoot + "/themes";
    recursive = true;
  };

}
