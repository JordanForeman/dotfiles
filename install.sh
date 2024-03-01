#!/bin/zsh

touch ~/.profile

for script in ./scripts/*.sh
do
    if [ -f "$script" ]; then
        chmod +x "$script"
        . "$script" "$@"
    fi
done

source ~/.zshrc
