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
    docker
    colima
  ];

  home.file = {
    ".config/nvim".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/nvim";
    ".config/aerospace".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/aerospace";
    ".config/lazygit".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/lazygit";
    ".config/ghostty".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/ghostty";
    ".config/zellij".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/zellij";
    ".config/sketchybar".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/sketchybar";

    ".config/starship.toml".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.config/starship.toml";

    ".aliases".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.aliases";
    ".gitconfig".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.gitconfig";
    ".vimrc".source = config.lib.file.mkOutOfStoreSymlink "/Users/jordan/Developer/dotfiles/.vimrc";
  };

  programs.zsh = {
    enable = true;
    enableCompletion = false;
    
    plugins = [
      {
        name = "zsh-autocomplete";
        src = pkgs.fetchFromGitHub {
          owner = "marlonrichert";
          repo = "zsh-autocomplete";
          rev = "24.09.04";
          sha256 = "sha256-o8IQszQ4/PLX1FlUvJpowR2Tev59N8lI20VymZ+Hp4w=";
        };
        file = "zsh-autocomplete.plugin.zsh";
      }
      {
        name = "zsh-autosuggestions";
        src = pkgs.fetchFromGitHub {
          owner = "zsh-users";
          repo = "zsh-autosuggestions";
          rev = "v0.7.1";
          sha256 = "sha256-KLUYpUu4DHRumQZ3w59m9aTW6TBKMCXl2UcKi4uMd7w=";
        };
        file = "zsh-autosuggestions.zsh";
      }
    ];
    
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
    DOCKER_HOST = "unix://${config.home.homeDirectory}/.colima/default/docker.sock";
  };

  launchd.agents.colima = {
    enable = true;
    config = {
      ProgramArguments = [
        "${pkgs.colima}/bin/colima"
        "start"
        "--foreground"
      ];
      RunAtLoad = true;
      KeepAlive = true;
      StandardOutPath = "/tmp/colima.log";
      StandardErrorPath = "/tmp/colima.err.log";
    };
  };

  launchd.agents.mysql = {
    enable = true;
    config = {
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "while ! ${pkgs.docker}/bin/docker info >/dev/null 2>&1; do sleep 1; done && ${pkgs.docker}/bin/docker run --rm --name mysql -p 3306:3306 -v mysql-data:/var/lib/mysql mysql:8"
      ];
      RunAtLoad = true;
      KeepAlive = false;
    };
  };

  programs.home-manager.enable = true;
}
