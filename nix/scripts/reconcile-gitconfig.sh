#!/usr/bin/env bash
set -euo pipefail

# Reconcile .gitconfig: seed from dotfiles but keep writable for local modifications

gitconfig_source="$1"
gitconfig_target="$HOME/.gitconfig"
gitconfig_base="$HOME/.gitconfig.dotfiles-base"

# Always update the base reference
if [ -f "$gitconfig_source" ]; then
  cp "$gitconfig_source" "$gitconfig_base"
  chmod 644 "$gitconfig_base"
fi

# If no .gitconfig exists, seed it from dotfiles
if [ ! -f "$gitconfig_target" ]; then
  echo "Seeding .gitconfig from dotfiles..."
  cp "$gitconfig_source" "$gitconfig_target"
  chmod 644 "$gitconfig_target"
# If .gitconfig exists but is a symlink (from old config), replace with copy
elif [ -L "$gitconfig_target" ]; then
  echo "Converting .gitconfig symlink to writable file..."
  rm "$gitconfig_target"
  cp "$gitconfig_source" "$gitconfig_target"
  chmod 644 "$gitconfig_target"
# If .gitconfig exists and differs from base, warn about drift
elif [ -f "$gitconfig_base" ] && ! cmp -s "$gitconfig_target" "$gitconfig_base"; then
  echo ""
  echo "⚠️  .gitconfig has local modifications"
  echo "   Base:   $gitconfig_base"
  echo "   Active: $gitconfig_target"
  echo "   Run 'diff ~/.gitconfig.dotfiles-base ~/.gitconfig' to review"
  echo ""
fi
