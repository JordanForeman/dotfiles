#!/usr/bin/env bash
set -euo pipefail

# Ensure Pi coding agent is installed globally via npm.
# Called from home-manager activation.
#
# Uses ~/.npm-global as the prefix so we don't write into the read-only Nix store.
# The activation script that calls this adds ~/.npm-global/bin to PATH via sessionPath.

npm_bin="$1"
desired_version="0.78.0"
prefix="$HOME/.npm-global"

# Ensure node is on PATH for postinstall scripts (e.g. koffi native build)
export PATH="$(dirname "$npm_bin"):$PATH"

mkdir -p "$prefix"

# Check existing version (look in our prefix first)
current_version="$("$prefix/bin/pi" --version 2>/dev/null || true)"

if [ "$current_version" = "$desired_version" ]; then
  exit 0
fi

echo "→ Installing Pi coding agent v${desired_version} (@earendil-works)"
# Remove legacy package name first so npm can replace the `pi` binary cleanly.
"$npm_bin" uninstall -g "@mariozechner/pi-coding-agent" --prefix "$prefix" --no-audit --no-fund >/dev/null 2>&1 || true
"$npm_bin" install -g "@earendil-works/pi-coding-agent@${desired_version}" \
  --prefix "$prefix" --no-audit --no-fund 2>&1 || \
  echo "⚠️  Failed to install Pi coding agent; continuing activation"
