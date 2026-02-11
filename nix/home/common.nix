{ config, pkgs, lib, ... }:

{
  programs.home-manager.enable = true;

  # nixpkgs is pinned via flake; avoid release-mismatch warnings.
  home.enableNixpkgsReleaseCheck = false;

  xdg.enable = true;

  home.file.".gitconfig".source = ../../.gitconfig;
  home.file.".vimrc".source = ../../.vimrc;
  home.file.".aliases".source = ../../.aliases;

  xdg.configFile."nvim" = {
    source = ../../.config/nvim;
    recursive = true;
  };

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

    chruby
    nodejs
    python3
    python3Packages.pip
    go
    bun
  ];
}
