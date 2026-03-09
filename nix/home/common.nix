{ config, pkgs, lib, sqlit, ... }:

let
  pair-review-unwrapped = import ../pkgs/pair-review.nix { inherit pkgs; };

  # Wrapper that runs pair-review with mise's node@22 to fix native module ABI compatibility
  # The Nix-built better-sqlite3 native module was compiled against Node 22, but mise's
  # default node (24.x) has an incompatible V8 ABI. This wrapper ensures the spawned
  # child processes also use Node 22.
  pair-review = pkgs.writeShellScriptBin "pair-review" ''
    exec ${pkgs.mise}/bin/mise exec node@22 -- ${pair-review-unwrapped}/bin/pair-review "$@"
  '';
in
{
  imports = [
    ./pi.nix
  ];

  pi.extensions = [
    {
      source = "git:https://github.com/pascal-de-ladurantaye/pi-agent@b82bbe70ae4af185a9a7fb9419b2ce87a788b1d6";
      extensions = [
        "extensions/bash-guard/**"
        "extensions/hashline/**"
      ];
      skills = [ ];
      prompts = [ ];
      themes = [ ];
    }
    "npm:pi-subagents"
  ];

  programs.home-manager.enable = true;

  # nixpkgs is pinned via flake; avoid release-mismatch warnings.
  home.enableNixpkgsReleaseCheck = false;

  # Suppress the home-manager news pager during switch.
  news.display = "silent";

  home.sessionVariables = {
    NPM_CONFIG_PREFIX = "${config.home.homeDirectory}/.npm-global";
  };

  xdg.enable = true;

  home.file.".aliases".source = ../../.aliases;

  xdg.configFile."lazygit" = {
    source = ../../.config/lazygit;
    recursive = true;
  };

  xdg.configFile."lazydocker" = {
    source = ../../.config/lazydocker;
    recursive = true;
  };

  xdg.configFile."starship.toml".source = ../../.config/starship.toml;

  xdg.configFile."zellij" = {
    source = ../../.config/zellij;
    recursive = true;
  };

  # Default packages - can be overridden in specific configurations
  home.packages = with pkgs; [
    bat
    eza
    ripgrep
    fd
    delta
    gh
    neovim
    bottom
    pandoc
    zellij
    lazygit
    gnupg
    openssl
    tor
    vim

    # Fly.io CLI
    flyctl

    # SQL TUI
    sqlit

    mise
    pair-review

    # Development tools
    nodejs
    python3
    python3Packages.pip
    go
    bun

    # Zsh plugins
    zsh-autocomplete
    zsh-autosuggestions
  ];

  # Pi coding agent (installed globally via npm)
  home.activation.installPi = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    ${pkgs.bash}/bin/bash ${../scripts/ensure-pi.sh} ${pkgs.nodejs}/bin/npm
  '';
}
