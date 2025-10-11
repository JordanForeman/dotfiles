#!/usr/bin/env bash

FOCUSED=$(aerospace list-workspaces --focused)

if [ "$1" = "$FOCUSED" ]; then
  sketchybar --set "$NAME" \
    icon="●" \
    icon.color=0xff89b4fa \
    background.color=0xff45475a \
    background.border_color=0xff89b4fa
else
  sketchybar --set "$NAME" \
    icon="$1" \
    icon.color=0xffcdd6f4 \
    background.color=0xff313244 \
    background.border_color=0xff45475a
fi
