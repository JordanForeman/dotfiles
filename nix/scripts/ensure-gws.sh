#!/usr/bin/env bash
set -euo pipefail

# Ensure Google Workspace CLI (gws) is installed globally via npm.
# Called from home-manager activation.
#
# Uses ~/.npm-global as the prefix so we don't write into the read-only Nix store.

npm_bin="$1"
extra_path="${2:-}"
prefix="$HOME/.npm-global"

# Ensure node and postinstall helpers are on PATH.
# Home Manager activation can run with a minimal PATH that omits /usr/bin, so
# npm postinstall scripts should not rely on distro tools being discoverable.
export PATH="$(dirname "$npm_bin")${extra_path:+:$extra_path}:$PATH"

mkdir -p "$prefix"

# Check if gws is already installed
if "$prefix/bin/gws" --version >/dev/null 2>&1; then
  exit 0
fi

echo "→ Installing Google Workspace CLI (gws)"
"$npm_bin" install -g "@googleworkspace/cli" \
  --prefix "$prefix" --no-audit --no-fund 2>&1 || \
  echo "⚠️  Failed to install gws CLI; continuing activation"
