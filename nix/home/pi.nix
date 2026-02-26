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
      ${pkgs.python3}/bin/python - <<'PY'
import json
from pathlib import Path

root = Path.home() / ".pi"
if not root.exists():
    raise SystemExit(0)

shared_packages = [
    "../agent/extensions/safety-gate.ts",
    "../agent/extensions/theme-switcher.ts",
    "../agent/extensions/pi-ask.ts",
    "../agent/extensions/ui-modern.ts",
    "../agent/extensions/subagents",
]
shared_themes = ["../agent/themes"]

for profile in root.iterdir():
    if not profile.is_dir() or not profile.name.startswith("agent-"):
        continue

    settings_path = profile / "settings.json"
    if not settings_path.exists():
        continue

    try:
        data = json.loads(settings_path.read_text())
    except Exception:
        continue

    changed = False

    packages = data.get("packages")
    if not isinstance(packages, list):
        packages = []
        data["packages"] = packages
        changed = True

    for item in shared_packages:
        if item not in packages:
            packages.append(item)
            changed = True

    themes = data.get("themes")
    if not isinstance(themes, list):
        themes = []
        data["themes"] = themes
        changed = True

    for item in shared_themes:
        if item not in themes:
            themes.append(item)
            changed = True

    if changed:
        settings_path.write_text(json.dumps(data, indent=2) + "\n")
PY
    fi
  '';

  # Copy subagents extension and install npm dependencies
  # We copy instead of symlink because node_modules must resolve from the actual directory
  home.activation.piExtensionDeps = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    srcDir="${../../pi/agent/extensions/subagents}"
    extDir="${config.home.homeDirectory}/.pi/agent/extensions/subagents"
    stateDir="${config.xdg.stateHome}/pi/extensions"
    hashFile="$stateDir/subagents-source.sha256"

    # Create extension directory
    mkdir -p "$extDir"
    mkdir -p "$stateDir"

    # Check if source has changed
    currentHash="$(${pkgs.findutils}/bin/find "$srcDir" -type f ! -name 'node_modules' ! -path '*/node_modules/*' -exec ${pkgs.coreutils}/bin/sha256sum {} \; | ${pkgs.coreutils}/bin/sort | ${pkgs.coreutils}/bin/sha256sum | ${pkgs.coreutils}/bin/cut -d' ' -f1)"
    
    previousHash=""
    if [ -f "$hashFile" ]; then
      previousHash="$(${pkgs.coreutils}/bin/cat "$hashFile")"
    fi

    if [ "$currentHash" != "$previousHash" ]; then
      echo "→ Copying Pi subagents extension"
      ${pkgs.rsync}/bin/rsync -a --delete --exclude='node_modules' "$srcDir/" "$extDir/"
      printf "%s" "$currentHash" > "$hashFile"
    fi

    # Install dependencies if needed
    pkgJson="$extDir/package.json"
    lockJson="$extDir/package-lock.json"
    
    if [ -f "$pkgJson" ] && [ ! -d "$extDir/node_modules/xstate" ]; then
      echo "→ Installing Pi subagents extension dependencies"
      (
        cd "$extDir"
        if [ -f "$lockJson" ]; then
          ${pkgs.nodejs}/bin/npm ci --no-audit --no-fund --omit=dev
        else
          ${pkgs.nodejs}/bin/npm install --no-audit --no-fund --omit=dev
        fi
      ) || echo "⚠️  Failed to install Pi subagents extension dependencies; continuing activation"
    fi
  '';

  home.file.".pi/agent/keybindings.json".source = ../../pi/agent/keybindings.json;

  # Note: subagents extension is copied via piExtensionDeps activation (not symlinked)
  # because it has npm dependencies that need to resolve from the actual directory.
  # Other extensions are symlinked normally.
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
