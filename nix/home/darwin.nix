{ config, pkgs, ... }:

{
  home.file.".zshrc".source = ../../.zshrc;

  xdg.configFile."ghostty" = {
    source = ../../.config/ghostty;
    recursive = true;
  };

  # Neovim configuration (reconciled)
  xdg.configFile."nvim" = {
    source = ../../.config/nvim;
    recursive = true;
  };
}
