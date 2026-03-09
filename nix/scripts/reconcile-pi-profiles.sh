#!/usr/bin/env bash
set -euo pipefail

# Reconcile alternate Pi profile settings (e.g. ~/.pi/agent-*)
# with generated shared defaults.
# Called from Home Manager activation.

profile_root="$1"
python_bin="$2"
script_path="$3"

if [ -d "$profile_root" ]; then
  "$python_bin" "$script_path" \
    "$profile_root" \
    "$profile_root/profile-settings-defaults.json"
fi
