#!/bin/zsh

# Check if the current OS is macOS
if [[ "$(uname)" == "Darwin" ]]; then
    echo "Detected macOS"

    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "Homebrew not found. Installing..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi

    # Brew > Cask
    brew install --cask \
        visual-studio-code \
        iterm2 \
        dbeaver-community \
        fantastical \
        todoist \
        obsidian \
        1password \
        altserver \
        discord \
        brave-browser \
        protonvpn \
        vlc \
        zoom \
        intellij-idea
else
    echo "This script is intended for macOS only."
fi
