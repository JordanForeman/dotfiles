#!/usr/bin/env bash

FOCUSED=$(aerospace list-workspaces --focused)

if [ "$1" = "$FOCUSED" ]; then
  sketchybar --set "$NAME" \
    icon="●" \
    icon.color=0xff89b4fa
else
  sketchybar --set "$NAME" \
    icon="$1" \
    icon.color=0xffcdd6f4
fi
