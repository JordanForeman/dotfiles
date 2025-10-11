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
    ".config/nvim" = {
      source = ../../.config/nvim;
      recursive = true;
    };
    
    ".config/aerospace" = {
      source = ../../.config/aerospace;
      recursive = true;
    };
    
    ".config/ghostty" = {
      source = ../../.config/ghostty;
      recursive = true;
    };
    
    ".config/zellij" = {
      source = ../../.config/zellij;
      recursive = true;
    };
    
    ".config/sketchybar/sketchybarrc".source = ../../.config/sketchybar/sketchybarrc;
    
    ".config/sketchybar/plugins/aerospace.sh" = {
      source = ../../.config/sketchybar/plugins/aerospace.sh;
      executable = true;
    };

    ".aliases".source = ../../.aliases;
    ".gitconfig".source = ../../.gitconfig;
    ".vimrc".source = ../../.vimrc;
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
