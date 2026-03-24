{ config, pkgs, ... }:

let
  dotfiles = "${config.home.homeDirectory}/.dotfiles";
in
{
  imports = [
    ../modules/git.nix
  ];

  home.file.".zshrc".source = ../../.zshrc;

  # Use out-of-store symlink sources so updates don't rewrite git-tracked /nix/store paths.

  xdg.configFile."ghostty".source = config.lib.file.mkOutOfStoreSymlink "${dotfiles}/.config/ghostty";

  # AeroSpace is macOS-only
  xdg.configFile."aerospace".source = config.lib.file.mkOutOfStoreSymlink "${dotfiles}/.config/aerospace";

  # Neovim configuration (reconciled)
  xdg.configFile."nvim".source = config.lib.file.mkOutOfStoreSymlink "${dotfiles}/.config/nvim";

  home.sessionVariables = {
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
}
