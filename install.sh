#!/bin/zsh

for script in ./scripts/*.sh
do
    if [ -f "$script" ]; then
        . "$script"
    fi
done

exec $SHELL
