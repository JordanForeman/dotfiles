#!/usr/bin/env bash
set -euo pipefail

# Rendered Pi settings artifacts are copied into ~/.pi as writable files.
# Called from Home Manager activation.

home_dir="$1"
rendered_settings="$2"
rendered_profile_defaults="$3"

install -Dm644 "$rendered_settings" "$home_dir/.pi/agent/settings.json"
install -Dm644 "$rendered_profile_defaults" "$home_dir/.pi/profile-settings-defaults.json"
