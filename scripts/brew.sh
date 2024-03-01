#!/bin/zsh

# Check if Homebrew is installed
if ! command -v brew &> /dev/null
then
    echo "🍺 Homebrew is not installed. Installing now..."
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
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
    exa \
    tor \
    colima \
    spaceship \
    gh