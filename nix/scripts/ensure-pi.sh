#!/usr/bin/env bash
set -euo pipefail

# Ensure Pi coding agent is installed globally via npm.
# Called from home-manager activation.
#
# Uses ~/.npm-global as the prefix so we don't write into the read-only Nix store.
# Shell setup keeps ~/.npm-global/bin on PATH after runtime-manager activation.

npm_bin="$1"
package="@earendil-works/pi-coding-agent"
prefix="$HOME/.npm-global"

# Ensure node is on PATH for postinstall scripts (e.g. koffi native build)
export PATH="$(dirname "$npm_bin"):$PATH"

mkdir -p "$prefix"

# Track npm's latest Node-based release without replacing a working install when
# the registry is unavailable.
desired_version="$("$npm_bin" view "$package@latest" version 2>/dev/null || true)"
if [ -z "$desired_version" ]; then
  echo "⚠️  Could not resolve the latest Pi version; keeping the current install"
  exit 0
fi

current_version="$("$prefix/bin/pi" --version 2>/dev/null || true)"
if [ "$current_version" = "$desired_version" ]; then
  exit 0
fi

echo "→ Installing Pi coding agent v${desired_version} (@earendil-works)"
# Remove legacy package name first so npm can replace the `pi` binary cleanly.
"$npm_bin" uninstall -g "@mariozechner/pi-coding-agent" --prefix "$prefix" --no-audit --no-fund >/dev/null 2>&1 || true
"$npm_bin" install -g "$package@${desired_version}" \
  --prefix "$prefix" --no-audit --no-fund 2>&1 || \
  echo "⚠️  Failed to install Pi coding agent; continuing activation"
