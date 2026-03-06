{ config, pkgs, lib, ... }:

{
  # Pi harness customization (versioned via dotfiles)
  #
  # NOTE: We intentionally do NOT manage the entire ~/.pi/agent directory, because
  # Pi stores machine-local state there (auth.json, sessions/). Instead we manage
  # only the specific files/directories we want synced.

  home.file.".pi/agent/AGENTS.md".source = ../../pi/agent/AGENTS.md;
  # settings.json needs to be writable at runtime (Pi saves settings back to it).
  # home.file creates read-only symlinks into the Nix store, so we reconcile it
  # via activation instead:
  # - seed from dotfiles if missing
  # - backfill new dotfiles defaults for missing keys
  # - preserve local/runtime keys (e.g. installed extension packages)
  home.activation.piSettings = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    ${pkgs.python3}/bin/python ${../scripts/reconcile-json-defaults.py} \
      ${../../pi/agent/settings.json} \
      ${config.home.homeDirectory}/.pi/agent/settings.json
  '';

  # Reconcile alternate Pi profiles (e.g. ~/.pi/agent-*) with shared dotfiles UI/tooling.
  # This stays generic: append shared extension/theme references and prune known
  # legacy package refs without touching other local profile settings.
  home.activation.piProfileSettingsMerge = lib.hm.dag.entryAfter [ "piSettings" ] ''
    ${pkgs.python3}/bin/python ${../scripts/reconcile-pi-profile-settings.py} \
      ${config.home.homeDirectory}/.pi
  '';

  home.file.".pi/agent/keybindings.json".source = ../../pi/agent/keybindings.json;

  # Extensions are symlinked from dotfiles.
  home.file.".pi/agent/extensions/theme-switcher.ts".source = ../../pi/agent/extensions/theme-switcher.ts;
  home.file.".pi/agent/extensions/safety-gate.ts".source = ../../pi/agent/extensions/safety-gate.ts;
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

  home.file.".pi/agent/subagents" = {
    source = ../../pi/agent/subagents;
    recursive = true;
  };

  home.file.".pi/agent/system-fragments" = {
    source = ../../pi/agent/system-fragments;
    recursive = true;
  };
}
