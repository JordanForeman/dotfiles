#!/usr/bin/env bash
set -euo pipefail

# Ensure hashline's transitive runtime dependency is installed when loading
# hashline directly from Pascal's git package.
# Called from Home Manager activation.

profile_root="$1"
npm_bin="$2"

install_diff_for_hashline() {
  local hashline_dir="$1"

  if [ ! -f "$hashline_dir/index.ts" ]; then
    return
  fi

  if [ -d "$hashline_dir/node_modules/diff" ]; then
    return
  fi

  echo "→ Installing hashline dependency (diff@8.0.0) in $hashline_dir"
  "$npm_bin" install \
    --prefix "$hashline_dir" \
    --no-save \
    --no-audit \
    --no-fund \
    diff@8.0.0 >/dev/null 2>&1 || \
    echo "⚠️  Failed to install diff for hashline at $hashline_dir"
}

install_diff_for_hashline "$profile_root/agent/git/github.com/pascal-de-ladurantaye/pi-agent/extensions/hashline"

for profile_dir in "$profile_root"/agent-*; do
  if [ -d "$profile_dir" ]; then
    install_diff_for_hashline "$profile_dir/git/github.com/pascal-de-ladurantaye/pi-agent/extensions/hashline"
  fi
done
