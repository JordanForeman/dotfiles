{ config, pkgs, lib, sqlit, ... }:

let
  pair-review = import ../pkgs/pair-review.nix { inherit pkgs; };
in
{
  imports = [
    ./pi.nix
  ];

  programs.home-manager.enable = true;

  # nixpkgs is pinned via flake; avoid release-mismatch warnings.
  home.enableNixpkgsReleaseCheck = false;

  xdg.enable = true;

  home.file.".gitconfig".source = ../../.gitconfig;
  home.file.".aliases".source = ../../.aliases;

  xdg.configFile."zellij" = {
    source = ../../.config/zellij;
    recursive = true;
  };

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

    # AI code review
    pair-review

    chruby
    nodejs
    python3
    python3Packages.pip
    go
    bun
  ];
}
