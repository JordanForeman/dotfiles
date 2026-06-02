{ config, pkgs, lib, sqlit, zjstatus, ... }:

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
      source = "git:https://github.com/pascal-de-ladurantaye/pi-agent@main";
      extensions = [
        "extensions/bash-guard/**"
        "extensions/hashline/**"
      ];
      skills = [ ];
      prompts = [ ];
      themes = [ ];
    }
    "npm:pi-subagents"
    "npm:pi-powerline-footer"
  ];


  pi.optionalExtensions = [
    "figma-labor"
    "figma-mcp.ts"
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

  # Keep these as repo-backed out-of-store symlinks to avoid /nix/store path churn in git.

  home.file.".aliases".source = ../../.aliases;

  xdg.configFile."lazygit".source = config.lib.file.mkOutOfStoreSymlink ../../.config/lazygit;

  xdg.configFile."lazydocker".source = config.lib.file.mkOutOfStoreSymlink ../../.config/lazydocker;

  xdg.configFile."starship.toml".source = config.lib.file.mkOutOfStoreSymlink ../../.config/starship.toml;

  # Split Zellij state so plugin binary is sourced from Nix package while config/layouts stay repo-tracked.
  xdg.configFile."zellij/config.kdl".source = config.lib.file.mkOutOfStoreSymlink ../../.config/zellij/config.kdl;
  xdg.configFile."zellij/layouts".source = config.lib.file.mkOutOfStoreSymlink ../../.config/zellij/layouts;
  xdg.configFile."zellij/themes".source = config.lib.file.mkOutOfStoreSymlink ../../.config/zellij/themes;

  # Keep plugin binary in Nix store (not tracked in git) for reproducible installs.
  home.file.".config/zellij/plugins/zjstatus.wasm".source = "${zjstatus}/bin/zjstatus.wasm";

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
    rustc
    cargo
    rustfmt
    clippy
    rust-analyzer

    # Zsh plugins
    zsh-autocomplete
    zsh-autosuggestions
  ];

  # Pi coding agent (installed globally via npm)
  home.activation.installPi = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    ${pkgs.bash}/bin/bash ${../scripts/ensure-pi.sh} ${pkgs.nodejs}/bin/npm
  '';

  # Google Workspace CLI (installed globally via npm)
  home.activation.installGws = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    ${pkgs.bash}/bin/bash ${../scripts/ensure-gws.sh} ${pkgs.nodejs}/bin/npm
  '';
}
