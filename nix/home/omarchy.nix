{ config, pkgs, ... }:

{
  # Intentionally do not manage Omarchy-owned desktop config (Hyprland, Waybar,
  # mako, walker, etc.). This host module is for user-level dev tooling only.

  programs.bash = {
    enable = true;

    initExtra = ''
      # Nix profile
      export PATH="$HOME/.nix-profile/bin:$PATH"

      # Nix daemon environment (multi-user install)
      if [ -e "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh" ]; then
        . "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh"
      fi

      # home-manager wrapper location
      export PATH="$HOME/.local/bin:$PATH"

      # Omarchy bash layer
      if [ -f "$HOME/.local/share/omarchy/default/bash/rc" ]; then
        . "$HOME/.local/share/omarchy/default/bash/rc"
      fi

      # Shared aliases file (from dotfiles)
      if [ -f "$HOME/.aliases" ]; then
        . "$HOME/.aliases"
      fi
    '';
  };
}
