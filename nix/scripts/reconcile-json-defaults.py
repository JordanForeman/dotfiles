#!/usr/bin/env python3
"""Seed/merge JSON defaults without overwriting user-local keys.

Usage:
  reconcile-json-defaults.py TEMPLATE TARGET

Behavior:
  - If TARGET is missing, copy TEMPLATE as-is.
  - If TARGET exists, recursively add only missing keys from TEMPLATE.
  - Existing scalar/list values in TARGET are preserved.
"""

from __future__ import annotations

import json
import shutil
import sys
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


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: reconcile-json-defaults.py TEMPLATE TARGET", file=sys.stderr)
        return 2

    template_path = Path(sys.argv[1]).expanduser()
    target_path = Path(sys.argv[2]).expanduser()

    if not template_path.exists():
        return 0

    if not target_path.exists():
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(template_path, target_path)
        return 0

    try:
        template = json.loads(template_path.read_text())
    except Exception:
        return 0

    try:
        current = json.loads(target_path.read_text())
    except Exception:
        current = {}

    if not isinstance(current, dict):
        current = {}

    if merge_missing(current, template):
        target_path.write_text(json.dumps(current, indent=2) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
