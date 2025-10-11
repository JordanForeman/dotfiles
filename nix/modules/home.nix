{ config, pkgs, ... }:

{
  home.stateVersion = "24.11";

  home.packages = with pkgs; [
    chruby
    nodejs-slim
    corepack
    python3
    python3Packages.pip
    go
    bun
    opencode
    rustc
    cargo
  ];

  home.file = {
    ".config/nvim".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/nvim";
    
    ".config/aerospace".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/aerospace";
    
    ".config/ghostty".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/ghostty";
    
    ".config/zellij".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/zellij";
    
    ".config/sketchybar".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/sketchybar";

    ".aliases".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.aliases";
    ".gitconfig".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.gitconfig";
    ".vimrc".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.vimrc";
  };

  programs.zsh = {
    enable = true;
    initContent = ''
      # Source aliases
      source ~/.aliases
      
      # chruby setup (supports .ruby-version files automatically)
      source ${pkgs.chruby}/share/chruby/chruby.sh
      source ${pkgs.chruby}/share/chruby/auto.sh
      
      # NVM setup (supports .nvmrc files automatically)
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
      [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/bash_completion"
      
      # Go environment
      export GOPATH="$HOME/go"
      export PATH="$PATH:$GOPATH/bin"
      
      # Bun environment
      export BUN_INSTALL="$HOME/.bun"
      export PATH="$BUN_INSTALL/bin:$PATH"

      # Starship.rs
      eval "$(starship init zsh)"

      # Shadowenv (project environment management)
      if command -v shadowenv &> /dev/null; then
        eval "$(shadowenv init zsh)"
      fi
    '';
  };

  home.sessionVariables = {
    EDITOR = "nvim";
  };

  programs.home-manager.enable = true;
}
