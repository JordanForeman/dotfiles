#!/bin/zsh

# Check if Homebrew is installed
if ! command -v brew &> /dev/null
then
    echo "🍺 Homebrew is not installed. Installing now..."
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    if [[ "$(uname)" == "Linux" ]]; then
        test -d ~/.linuxbrew && eval "$(~/.linuxbrew/bin/brew shellenv)"
        test -d /home/linuxbrew/.linuxbrew && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
        grep -qxF "eval \"\$($(brew --prefix)/bin/brew shellenv)\"" ~/.profile || echo "eval \"\$($(brew --prefix)/bin/brew shellenv)\"" >> ~/.profile
    fi
else
    echo "🍺 Homebrew is already installed."
fi

echo "📦 Installing Homebrew packages..."
brew install \
    bat \
    gnupg \
    openssl \
    node \
    nvm \
    eza \
    tor \
    colima \
    gh \
    git-delta \
    ripgrep \
    asdf \
    pandoc \
    zellij \
    neovim \
    fd \
    tmuxinator \
    bottom
