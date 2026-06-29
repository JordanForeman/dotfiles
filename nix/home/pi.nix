{ config, pkgs, lib, piAgent, ... }:

let
  piAgentRoot = piAgent + "/agent";
  settingsTemplate = builtins.fromJSON (builtins.readFile (piAgentRoot + "/settings.json"));

  renderedBaseSettings = pkgs.writeText "pi-settings.json" (
    builtins.toJSON (settingsTemplate // {
      packages = config.pi.extensions;
    })
  );

  renderedProfileMergeDefaults = pkgs.writeText "pi-profile-settings-defaults.json" (
    builtins.toJSON {
      packages = config.pi.profileSharedPackages;
      themes = config.pi.sharedThemes;
      prompts = settingsTemplate.prompts or [ ];
      skills = settingsTemplate.skills or [ ];
    }
  );

  fusionPresets = piAgentRoot + "/fusion.json";

  optionalExtensionsRoot = piAgentRoot + "/optional-extensions";

  optionalExtensionFiles = builtins.listToAttrs (
    map
      (name:
        let
          entryType = (builtins.readDir optionalExtensionsRoot)."${name}";
          sourcePath = optionalExtensionsRoot + "/${name}";
        in
        {
          name = ".pi/agent/optional-extensions/${name}";
          value =
            if entryType == "directory"
            then {
              source = sourcePath;
              recursive = true;
            }
            else {
              source = sourcePath;
            };
        })
      config.pi.optionalExtensions
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

    optionalExtensions = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = ''
        Optional local extensions to stage under ~/.pi/agent/optional-extensions.
        These are not auto-discovered by pi and can be loaded ad-hoc with --extension.
      '';
    };
  };

  config = lib.mkMerge [
    {
      home.file = optionalExtensionFiles;
    }
    {
      pi.profileSharedPackages = lib.mkDefault (
      [
        "../agent/extensions/theme-switcher.ts"
        "../agent/extensions/pi-ask.ts"
        "../agent/extensions/ralph-loop.ts"
        "../agent/extensions/discipline-gate.ts"
        "../agent/extensions/context-threshold/index.ts"
      ]
      ++ config.pi.extensions
    );

    # Pi harness customization (versioned via dotfiles)
    #
    # NOTE: We intentionally do NOT manage the entire ~/.pi/agent directory, because
    # Pi stores machine-local state there (auth.json, sessions/). Instead we manage
    # only the specific files/directories we want synced.

    # settings.json needs to be writable at runtime (Pi saves settings back to it).
    # home.file creates read-only symlinks into the Nix store, so we copy it via
    # an activation script instead.
    home.activation.piSettings = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      ${pkgs.bash}/bin/bash ${../scripts/reconcile-pi-settings.sh} \
        "${config.home.homeDirectory}" \
        ${renderedBaseSettings} \
        ${renderedProfileMergeDefaults}
    '';

    # pi-fusion presets live in ~/.pi/agent/fusion.json, which the extension writes
    # back to at runtime (arming toggle + first-run default prompts). A read-only
    # home.file symlink would break that, so we merge-seed it instead: missing keys
    # from the committed presets are added, while pi-fusion's runtime prompts and
    # any local edits are preserved. Changing an existing preset in-repo requires
    # editing ~/.pi/agent/fusion.json (merge-missing won't overwrite existing keys).
    home.activation.piFusionPresets = lib.hm.dag.entryAfter [ "piSettings" ] ''
      ${pkgs.python3}/bin/python ${../scripts/reconcile-json-defaults.py} \
        ${fusionPresets} \
        "${config.home.homeDirectory}/.pi/agent/fusion.json"
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

    # Remove replaced extension paths that should no longer be loaded.
    home.activation.piObsoleteExtensionCleanup = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      ${pkgs.bash}/bin/bash ${../scripts/cleanup-pi-obsolete-extensions.sh} \
        "${config.home.homeDirectory}"
    '';

    home.file.".pi/agent/keybindings.json".source = piAgentRoot + "/keybindings.json";

    # Extension package loading is handled via settings packages.
    # Local shareable extensions are symlinked normally.
    home.file.".pi/agent/extensions/theme-switcher.ts".source = piAgentRoot + "/extensions/theme-switcher.ts";
    home.file.".pi/agent/extensions/pi-ask.ts".source = piAgentRoot + "/extensions/pi-ask.ts";
    home.file.".pi/agent/extensions/ralph-loop.ts".source = piAgentRoot + "/extensions/ralph-loop.ts";
    home.file.".pi/agent/extensions/discipline-gate.ts".source = piAgentRoot + "/extensions/discipline-gate.ts";
    home.file.".pi/agent/extensions/linear.ts".source = piAgentRoot + "/extensions/linear.ts";
    home.file.".pi/agent/extension-core" = {
      source = piAgentRoot + "/extension-core";
      recursive = true;
    };

    # Optional extensions are staged outside auto-discovery and loaded ad-hoc (e.g. via `pi -e ...`).
    # Shared extension base classes are synced separately in ~/.pi/agent/extension-core.

    home.file.".pi/agent/extensions/context-threshold" = {
      source = piAgentRoot + "/extensions/context-threshold";
      recursive = true;
    };

    home.file.".pi/agent/prompts" = {
      source = piAgentRoot + "/prompts";
      recursive = true;
    };

    home.file.".pi/agent/skills" = {
      source = piAgentRoot + "/skills";
      recursive = true;
    };

    home.file.".pi/agent/themes" = {
      source = piAgentRoot + "/themes";
      recursive = true;
    };

    # Source-of-truth agent definitions live in pi-agent/agent/subagents, but are synced
    # to ~/.pi/agent/agents to match pi-subagents discovery paths.
    home.file.".pi/agent/agents" = {
      source = piAgentRoot + "/subagents";
      recursive = true;
    };

    }
  ];
}
