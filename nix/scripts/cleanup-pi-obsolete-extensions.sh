#!/usr/bin/env bash
set -euo pipefail

# Remove obsolete extension paths that should no longer be loaded.
# Called from Home Manager activation.

home_dir="$1"

for ext_path in \
  "$home_dir/.pi/agent/extensions/subagents" \
  "$home_dir/.pi/agent/extensions/subagent" \
  "$home_dir/.pi/agent/extensions/safety-gate.ts" \
  "$home_dir/.pi/agent/extensions/figma-labor" \
  "$home_dir/.pi/agent/extensions/prompt-composer" \
  "$home_dir/.pi/agent/extensions/figma-mcp.ts"
do
  if [ -d "$ext_path" ]; then
    echo "→ Removing obsolete extension directory at $ext_path"
    rm -rf "$ext_path"
  elif [ -f "$ext_path" ] || [ -L "$ext_path" ]; then
    echo "→ Removing obsolete extension file at $ext_path"
    rm -f "$ext_path"
  fi
done
