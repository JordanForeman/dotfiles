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
    target="${config.home.homeDirectory}/.pi/agent/settings.json"
    template="${../../pi/agent/settings.json}"

    if [ ! -f "$target" ]; then
      install -Dm644 "$template" "$target"
    else
      ${pkgs.python3}/bin/python - <<'PY'
import json
from pathlib import Path


def merge_missing(dst, src):
    if isinstance(dst, dict) and isinstance(src, dict):
        changed = False
        for key, value in src.items():
            if key not in dst:
                dst[key] = value
                changed = True
            else:
                changed = merge_missing(dst[key], value) or changed
        return changed
    return False


template_path = Path("${../../pi/agent/settings.json}")
target_path = Path("${config.home.homeDirectory}/.pi/agent/settings.json")

try:
    template = json.loads(template_path.read_text())
except Exception:
    raise SystemExit(0)

try:
    current = json.loads(target_path.read_text())
except Exception:
    current = {}

if not isinstance(current, dict):
    current = {}

if merge_missing(current, template):
    target_path.write_text(json.dumps(current, indent=2) + "\n")
PY
    fi
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
]
# Legacy package references to remove if present.
deprecated_packages = [
    "../agent/extensions/subagents",
    "../agent/extensions/subagent",
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

    original_len = len(packages)
    packages = [item for item in packages if item not in deprecated_packages]
    if len(packages) != original_len:
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
