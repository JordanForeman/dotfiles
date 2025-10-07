{ config, pkgs, lib, ... }:

let
  # Define all dotfile mappings in one place
  dotfileLinks = {
    # Individual files
    ".gitconfig" = ../../.gitconfig;
    ".vimrc" = ../../.vimrc;
    
    # Config directories
    ".config/nvim" = ../../.config/nvim;
    ".config/zellij" = ../../.config/zellij;
    ".config/ghostty" = ../../.config/ghostty;
    ".config/aerospace" = ../../.config/aerospace;
    ".config/sketchybar" = ../../.config/sketchybar;
  };
  
  # Generate symlink commands for all dotfiles
  symlinkCommands = lib.concatStringsSep "\n" (
    lib.mapAttrsToList (target: source: ''
      # ${target}
      rm -rf ~/${target}
      mkdir -p "$(dirname ~/${target})"
      ln -sf "${builtins.toString source}" ~/${target}
    '') dotfileLinks
  );
in
{
  # Create all dotfile symlinks in one activation script
  system.activationScripts.dotfiles.text = symlinkCommands;
}
