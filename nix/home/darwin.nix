{ config, pkgs, ... }:

{
  home.file.".zshrc".source = ../../.zshrc;

  xdg.configFile."ghostty" = {
    source = ../../.config/ghostty;
    recursive = true;
  };
}
