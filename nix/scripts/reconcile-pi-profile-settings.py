#!/usr/bin/env python3
"""Reconcile ~/.pi/agent-*/settings.json with shared dotfiles defaults.

This script appends required shared package/theme references and removes known
legacy package references that should no longer be loaded.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


SHARED_PACKAGES = [
    "../agent/extensions/safety-gate.ts",
    "../agent/extensions/theme-switcher.ts",
    "../agent/extensions/pi-ask.ts",
    "../agent/extensions/ui-modern.ts",
]

DEPRECATED_PACKAGES = [
    "../agent/extensions/subagents",
    "../agent/extensions/subagent",
]

SHARED_THEMES = ["../agent/themes"]


def main() -> int:
    root = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / ".pi"
    if not root.exists() or not root.is_dir():
        return 0

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

        if not isinstance(data, dict):
            continue

        changed = False

        packages = data.get("packages")
        if not isinstance(packages, list):
            packages = []
            data["packages"] = packages
            changed = True

        original_len = len(packages)
        packages = [item for item in packages if item not in DEPRECATED_PACKAGES]
        if len(packages) != original_len:
            data["packages"] = packages
            changed = True

        for item in SHARED_PACKAGES:
            if item not in packages:
                packages.append(item)
                changed = True

        themes = data.get("themes")
        if not isinstance(themes, list):
            themes = []
            data["themes"] = themes
            changed = True

        for item in SHARED_THEMES:
            if item not in themes:
                themes.append(item)
                changed = True

        if changed:
            settings_path.write_text(json.dumps(data, indent=2) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
