{ config, pkgs, ... }:

{
  home.file.".zshrc".source = ../../.zshrc;

  xdg.configFile."ghostty" = {
    source = ../../.config/ghostty;
    recursive = true;
  };

  # Use Omarchy's Neovim configuration on macOS as well.
  xdg.configFile."nvim" = {
    source = ../../.config/nvim-omarchy;
    recursive = true;
  };
}
