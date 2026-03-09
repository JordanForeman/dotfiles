{ config, pkgs, lib, ... }:

let
  settingsTemplate = builtins.fromJSON (builtins.readFile ../../pi/agent/settings.json);

  renderedBaseSettings = pkgs.writeText "pi-settings.json" (
    builtins.toJSON (settingsTemplate // {
      packages = config.pi.extensions;
    })
  );

  renderedProfileMergeDefaults = pkgs.writeText "pi-profile-settings-defaults.json" (
    builtins.toJSON {
      packages = config.pi.profileSharedPackages;
      themes = config.pi.sharedThemes;
    }
  );
in
{
  options.pi = {
    extensions = lib.mkOption {
      type = lib.types.listOf lib.types.anything;
      default = settingsTemplate.packages or [ ];
      description = ''
        Pi extension packages to render into ~/.pi/agent/settings.json.
        Supports both string package references (e.g. "npm:pi-subagents")
        and object package definitions.
      '';
    };

    profileSharedPackages = lib.mkOption {
      type = lib.types.listOf lib.types.anything;
      default = [ ];
      description = ''
        Packages that should be ensured in ~/.pi/agent-*/settings.json by the
        profile reconciliation step.
      '';
    };

    sharedThemes = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "../agent/themes" ];
      description = "Themes ensured in ~/.pi/agent-*/settings.json during reconciliation.";
    };
  };

  config = {
    pi.profileSharedPackages = lib.mkDefault (
      [
        "../agent/extensions/theme-switcher.ts"
        "../agent/extensions/pi-ask.ts"
        "../agent/extensions/ui-modern.ts"
      ]
      ++ config.pi.extensions
    );

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
      ${pkgs.bash}/bin/bash ${../scripts/reconcile-pi-settings.sh} \
        "${config.home.homeDirectory}" \
        ${renderedBaseSettings} \
        ${renderedProfileMergeDefaults}
    '';

    # Reconcile alternate Pi profiles (e.g. ~/.pi/agent-*) with shared dotfiles UI/tooling.
    # This stays generic: for any sibling profile, append shared extension/theme references
    # without removing local profile-specific settings.
    home.activation.piProfileSettingsMerge = lib.hm.dag.entryAfter [ "piSettings" ] ''
      ${pkgs.bash}/bin/bash ${../scripts/reconcile-pi-profiles.sh} \
        "${config.home.homeDirectory}/.pi" \
        ${pkgs.python3}/bin/python \
        ${../scripts/reconcile-pi-profile-settings.py}
    '';

    # Ensure Pascal hashline's transitive dependency is present when loading just
    # selected extensions from his git package.
    home.activation.piHashlineDependency = lib.hm.dag.entryAfter [ "piProfileSettingsMerge" ] ''
      ${pkgs.bash}/bin/bash ${../scripts/ensure-pi-hashline-deps.sh} \
        "${config.home.homeDirectory}/.pi" \
        ${pkgs.nodejs}/bin/npm
    '';

    # Remove replaced extension paths that should no longer be loaded.
    home.activation.piObsoleteExtensionCleanup = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      ${pkgs.bash}/bin/bash ${../scripts/cleanup-pi-obsolete-extensions.sh} \
        "${config.home.homeDirectory}"
    '';

    home.file.".pi/agent/keybindings.json".source = ../../pi/agent/keybindings.json;

    # Extension package loading is handled via settings packages.
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
  };
}
