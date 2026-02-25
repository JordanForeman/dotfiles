{ config, pkgs, lib, ... }:

{
  imports = [
    ../modules/git.nix
  ];

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

  # Keep Omarchy's built-in Neovim setup in place. If an earlier Home Manager
  # run backed up files and left ~/.config/nvim missing init.lua, restore the
  # backup files without overwriting any existing active files.
  home.activation.restoreOmarchyNeovim = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    nvim_dir="${config.home.homeDirectory}/.config/nvim"
    backup_suffix=".backup-before-home-manager"

    if [ -d "$nvim_dir" ] && [ ! -f "$nvim_dir/init.lua" ] && [ -f "$nvim_dir/init.lua$backup_suffix" ]; then
      echo "Restoring Omarchy Neovim config from Home Manager backups..."
      find "$nvim_dir" -type f -name "*$backup_suffix" | while IFS= read -r file; do
        target="''${file%$backup_suffix}"
        if [ ! -e "$target" ]; then
          mkdir -p "$(dirname "$target")"
          cp "$file" "$target"
        fi
      done

      if [ -f "${config.home.homeDirectory}/.config/omarchy/current/theme/neovim.lua" ]; then
        ln -snf "${config.home.homeDirectory}/.config/omarchy/current/theme/neovim.lua" "$nvim_dir/lua/plugins/theme.lua"
      fi
    fi
  '';
}
