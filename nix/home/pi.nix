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

  # Ensure extension-local npm dependencies are installed for Pi extensions that
  # import from node_modules (e.g. subagents extension using xstate).
  home.activation.piExtensionDeps = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    extDir="${config.home.homeDirectory}/.pi/agent/extensions/subagents"
    pkgJson="$extDir/package.json"
    lockJson="$extDir/package-lock.json"
    stateDir="${config.xdg.stateHome}/pi/extensions"
    hashFile="$stateDir/subagents-deps.sha256"

    if [ -f "$pkgJson" ]; then
      mkdir -p "$stateDir"

      if [ -f "$lockJson" ]; then
        currentHash="$(${pkgs.coreutils}/bin/sha256sum "$pkgJson" "$lockJson" | ${pkgs.coreutils}/bin/sha256sum | ${pkgs.coreutils}/bin/cut -d' ' -f1)"
      else
        currentHash="$(${pkgs.coreutils}/bin/sha256sum "$pkgJson" | ${pkgs.coreutils}/bin/cut -d' ' -f1)"
      fi

      previousHash=""
      if [ -f "$hashFile" ]; then
        previousHash="$(${pkgs.coreutils}/bin/cat "$hashFile")"
      fi

      if [ "$currentHash" != "$previousHash" ] || [ ! -d "$extDir/node_modules/xstate" ]; then
        echo "→ Installing Pi subagents extension dependencies"

        installOk=0
        if [ -f "$lockJson" ]; then
          if (
            cd "$extDir"
            ${pkgs.nodejs}/bin/npm ci --no-audit --no-fund --omit=dev
          ); then
            installOk=1
          fi
        else
          if (
            cd "$extDir"
            ${pkgs.nodejs}/bin/npm install --no-audit --no-fund --omit=dev --package-lock=false
          ); then
            installOk=1
          fi
        fi

        if [ "$installOk" -eq 1 ]; then
          printf "%s" "$currentHash" > "$hashFile"
        else
          echo "⚠️  Failed to install Pi subagents extension dependencies; continuing activation"
        fi
      fi
    fi
  '';

  home.file.".pi/agent/keybindings.json".source = ../../pi/agent/keybindings.json;

  home.file.".pi/agent/extensions" = {
    source = ../../pi/agent/extensions;
    recursive = true;
  };

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
