{ pkgs, ... }:

let
  herdr = import ../pkgs/herdr.nix { inherit pkgs; };
in
{
  imports = [
    ../modules/git.nix
  ];

  programs.home-manager.enable = true;

  # Keep the first server profile intentionally small; add shared modules once
  # they prove useful on home1.
  home.enableNixpkgsReleaseCheck = false;
  news.display = "silent";
  xdg.enable = true;

  home.file.".aliases".source = ../../.aliases;

  home.packages = with pkgs; [
    bat
    eza
    ripgrep
    fd
    delta
    gh
    herdr
    neovim
    vim
    zellij
    lazygit
    gnupg
    openssl
  ];
}
