{ config, pkgs, lib, ... }:

{
  # Pi harness customization (versioned via dotfiles)
  #
  # NOTE: We intentionally do NOT manage the entire ~/.pi/agent directory, because
  # Pi stores machine-local state there (auth.json, sessions/). Instead we manage
  # only the specific files/directories we want synced.

  home.file.".pi/agent/AGENTS.md".source = ../../pi/agent/AGENTS.md;
  # settings.json needs to be writable at runtime (Pi saves settings back to it).
  # home.file creates read-only symlinks into the Nix store, so we copy it via
  # an activation script instead.
  home.activation.piSettings = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    install -Dm644 ${../../pi/agent/settings.json} \
      "${config.home.homeDirectory}/.pi/agent/settings.json"
  '';

  # Reconcile alternate Pi profiles (e.g. ~/.pi/agent-*) with shared dotfiles UI/tooling.
  # This stays generic: for any sibling profile, append shared extension/theme references
  # without removing local profile-specific settings.
  home.activation.piProfileSettingsMerge = lib.hm.dag.entryAfter [ "piSettings" ] ''
    profileRoot="${config.home.homeDirectory}/.pi"
    if [ -d "$profileRoot" ]; then
      ${pkgs.python3}/bin/python ${../scripts/reconcile-pi-profile-settings.py} "$profileRoot"
    fi
  '';

  # Ensure Pi CLI is installed for the active mise Node LTS runtime.
  # This keeps `pi` available in new shells where mise selects node@lts.
  home.activation.piCliInstall = lib.hm.dag.entryAfter [ "installPackages" "writeBoundary" ] ''
    if ! ${pkgs.mise}/bin/mise exec node@lts -- pi --version >/dev/null 2>&1; then
      echo "→ Installing Pi CLI via npm (node@lts)"
      ${pkgs.mise}/bin/mise exec node@lts -- npm install -g --no-audit --no-fund @mariozechner/pi-coding-agent \
        || echo "⚠️  Failed to install Pi CLI; continuing activation"
    fi
  '';

  # Remove replaced extension paths that should no longer be loaded.
  home.activation.piObsoleteExtensionCleanup = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    for extPath in \
      "${config.home.homeDirectory}/.pi/agent/extensions/subagents" \
      "${config.home.homeDirectory}/.pi/agent/extensions/subagent" \
      "${config.home.homeDirectory}/.pi/agent/extensions/safety-gate.ts"
    do
      if [ -d "$extPath" ]; then
        echo "→ Removing obsolete extension directory at $extPath"
        rm -rf "$extPath"
      elif [ -f "$extPath" ] || [ -L "$extPath" ]; then
        echo "→ Removing obsolete extension file at $extPath"
        rm -f "$extPath"
      fi
    done
  '';

  home.file.".pi/agent/keybindings.json".source = ../../pi/agent/keybindings.json;

  # Extension package loading is handled via settings packages (npm:pi-subagents).
  # Local shareable extensions are symlinked normally.
  home.file.".pi/agent/extensions/theme-switcher.ts".source = ../../pi/agent/extensions/theme-switcher.ts;
  home.file.".pi/agent/extensions/pi-ask.ts".source = ../../pi/agent/extensions/pi-ask.ts;
  home.file.".pi/agent/extensions/ui-modern.ts".source = ../../pi/agent/extensions/ui-modern.ts;

  home.file.".pi/agent/prompts" = {
    source = ../../pi/agent/prompts;
    recursive = true;
  };

  home.file.".pi/agent/skills" = {
    source = ../../pi/agent/skills;
    recursive = true;
  };

  home.file.".pi/agent/themes" = {
    source = ../../pi/agent/themes;
    recursive = true;
  };

  # Source-of-truth agent definitions live in pi/agent/subagents, but are synced
  # to ~/.pi/agent/agents to match pi-subagents discovery paths.
  home.file.".pi/agent/agents" = {
    source = ../../pi/agent/subagents;
    recursive = true;
  };

  home.file.".pi/agent/system-fragments" = {
    source = ../../pi/agent/system-fragments;
    recursive = true;
  };
}
