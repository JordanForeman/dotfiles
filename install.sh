#!/bin/zsh

for script in ./scripts/*.sh
do
    if [ -f "$script" ]; then
        chmod +x "$script"
        . "$script" "$@"
    fi
done

exec $SHELL
