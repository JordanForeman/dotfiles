#!/bin/zsh

WITH_CASK=""
# Parse command line arguments
for arg in "$@"
do
    case $arg in
        --with-cask)
        WITH_CASK="--with-cask"
        shift # Remove --with-cask from processing
        ;;
        *)
        shift # Remove generic argument from processing
        ;;
    esac
done

# Check if the current OS is macOS
if [[ "$WITH_CASK" == "--with-cask" ]]; then
    if [[ "$(uname)" == "Darwin" ]]; then
        echo "Installing Homebrew Casks..."

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
        echo "--with-cask option is intended for macOS only."
    fi
fi
