#!/usr/bin/env python3
"""Reconcile ~/.pi/agent-*/settings.json with shared dotfiles defaults.

This script appends required shared package/theme references while preserving
profile-local package choices.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


PASCAL_PI_AGENT_PACKAGE = {
    "source": "git:https://github.com/pascal-de-ladurantaye/pi-agent@main",
    "extensions": ["extensions/bash-guard/**"],
    "skills": [],
    "prompts": [],
    "themes": [],
}

DEFAULT_SHARED_PACKAGES: list[str | dict[str, Any]] = [
    "../agent/extensions/theme-switcher.ts",
    "../agent/extensions/pi-ask.ts",
    PASCAL_PI_AGENT_PACKAGE,
    "npm:pi-subagents",
    "npm:pi-powerline-footer",
]

DEFAULT_SHARED_THEMES = ["../agent/themes"]
DEFAULT_SHARED_PROMPTS = ["../agent/prompts/guides", "../agent/prompts/conventions", "../agent/prompts/formats", "../agent/prompts/standards"]
DEFAULT_SHARED_SKILLS = ["../agent/skills/guides", "../agent/skills/conventions", "../agent/skills/formats", "../agent/skills/standards"]


def load_shared_defaults(defaults_path: Path | None) -> tuple[list[Any], list[str]]:
    if defaults_path and defaults_path.exists():
        try:
            data = json.loads(defaults_path.read_text())
            if isinstance(data, dict):
                packages = data.get("packages")
                themes = data.get("themes")
                prompts = data.get("prompts")
                skills = data.get("skills")
                if isinstance(packages, list) and isinstance(themes, list):
                    return (
                        packages,
                        [t for t in themes if isinstance(t, str)],
                        [p for p in prompts if isinstance(p, str)] if isinstance(prompts, list) else list(DEFAULT_SHARED_PROMPTS),
                        [s for s in skills if isinstance(s, str)] if isinstance(skills, list) else list(DEFAULT_SHARED_SKILLS)
                    )
        except Exception:
            pass

    return list(DEFAULT_SHARED_PACKAGES), list(DEFAULT_SHARED_THEMES), list(DEFAULT_SHARED_PROMPTS), list(DEFAULT_SHARED_SKILLS)


def apply_profile_seed(data: dict[str, Any], seed: dict[str, Any]) -> bool:
    """Merge a profile-local seed into a profile's settings.

    Generic and additive, mirroring the shared-defaults merge: the seed supplies
    work-local values that no rendered default can regenerate (e.g. an alternate
    defaultModel/provider, or private package source blocks).

    - Scalar keys (defaultModel, defaultProvider, ...) are seeded ONLY when the
      profile has not already set them, so runtime edits always win.
    - `packages` are merged additively by source via ensure_package.
    - `extensions` (top-level enable/disable directives) are appended if missing.
    Returns True if anything changed.
    """
    changed = False

    for key, value in seed.items():
        if key in ("packages", "extensions"):
            continue
        if key not in data:
            data[key] = value
            changed = True

    seed_packages = seed.get("packages")
    if isinstance(seed_packages, list):
        packages = data.get("packages")
        if not isinstance(packages, list):
            packages = []
            data["packages"] = packages
        for item in seed_packages:
            if ensure_package(packages, item):
                changed = True

    seed_extensions = seed.get("extensions")
    if isinstance(seed_extensions, list):
        extensions = data.get("extensions")
        if not isinstance(extensions, list):
            extensions = []
            data["extensions"] = extensions
        for item in seed_extensions:
            if item not in extensions:
                extensions.append(item)
                changed = True

    return changed


def package_source(item: Any) -> str | None:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        source = item.get("source")
        if isinstance(source, str):
            return source
    return None


def ensure_package(packages: list[Any], wanted: str | dict[str, Any]) -> bool:
    if wanted in packages:
        return False

    wanted_source = package_source(wanted)
    if not wanted_source:
        packages.append(wanted)
        return True

    for i, existing in enumerate(packages):
        if package_source(existing) != wanted_source:
            continue

        if isinstance(existing, str):
            if isinstance(wanted, dict):
                packages[i] = wanted
                return True
            return False

        if isinstance(existing, dict) and isinstance(wanted, dict):
            changed = False
            for key, wanted_value in wanted.items():
                existing_value = existing.get(key)
                if isinstance(wanted_value, list):
                    if not isinstance(existing_value, list):
                        existing[key] = list(wanted_value)
                        changed = True
                        continue
                    for item in wanted_value:
                        if item not in existing_value:
                            existing_value.append(item)
                            changed = True
                elif existing_value != wanted_value:
                    existing[key] = wanted_value
                    changed = True
            return changed

        return False

    packages.append(wanted)
    return True


def main() -> int:
    root = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / ".pi"
    defaults_path = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else None

    if not root.exists() or not root.is_dir():
        return 0

    shared_packages, shared_themes, shared_prompts, shared_skills = load_shared_defaults(defaults_path)

    for profile in root.iterdir():
        if not profile.is_dir() or not profile.name.startswith("agent-"):
            continue

        settings_path = profile / "settings.json"

        # Optional profile-local seed (work-specific values version-controlled
        # outside this public repo, e.g. via a private overlay). Bootstraps a
        # missing settings.json and supplies non-regenerable local deltas.
        seed: dict[str, Any] = {}
        seed_path = profile / "settings.seed.json"
        if seed_path.exists():
            try:
                loaded_seed = json.loads(seed_path.read_text())
                if isinstance(loaded_seed, dict):
                    seed = loaded_seed
            except Exception:
                seed = {}

        if not settings_path.exists():
            if not seed:
                continue
            settings_path.write_text(json.dumps({}, indent=2) + "\n")

        try:
            data = json.loads(settings_path.read_text())
        except Exception:
            continue

        if not isinstance(data, dict):
            continue

        changed = False

        if seed and apply_profile_seed(data, seed):
            changed = True

        packages = data.get("packages")
        if not isinstance(packages, list):
            packages = []
            data["packages"] = packages
            changed = True

        for item in shared_packages:
            if ensure_package(packages, item):
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

        # Merge prompts
        profile_prompts = data.get("prompts")
        if not isinstance(profile_prompts, list):
            profile_prompts = []
            data["prompts"] = profile_prompts
            changed = True
        
        for item in shared_prompts:
            if item not in profile_prompts:
                profile_prompts.append(item)
                changed = True
        
        if "./prompts" not in profile_prompts:
            profile_prompts.append("./prompts")
            changed = True

        # Merge skills
        profile_skills = data.get("skills")
        if not isinstance(profile_skills, list):
            profile_skills = []
            data["skills"] = profile_skills
            changed = True
        
        for item in shared_skills:
            if item not in profile_skills:
                profile_skills.append(item)
                changed = True
        
        if "./skills" not in profile_skills:
            profile_skills.append("./skills")
            changed = True
        if changed:
            settings_path.write_text(json.dumps(data, indent=2) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
