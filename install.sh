#!/bin/zsh

echo "🚀 Setting up Jordan's development environment using nix-darwin..."
echo ""

# Check if nix is installed
if ! command -v nix &> /dev/null; then
    echo "❌ Nix is not installed. Please install it first:"
    echo "curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install"
    exit 1
fi

echo "✅ Nix is installed"

# Check if darwin-rebuild is available
if ! command -v darwin-rebuild &> /dev/null; then
    echo "❌ nix-darwin is not available. Please install it first or restart your shell."
    exit 1
fi

echo "✅ nix-darwin is available"
echo ""

echo "🔧 Building nix-darwin configuration..."
if darwin-rebuild build --flake .#Jordans-MacBook-Pro; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed. Please check the error messages above."
    exit 1
fi

echo ""
echo "🔄 Switching to new configuration..."
if sudo -E darwin-rebuild switch --flake .#Jordans-MacBook-Pro; then
    echo "✅ Configuration activated!"
else
    echo "❌ Switch failed. Please check the error messages above."
    exit 1
fi

echo ""
echo "🎉 Setup complete! Your development environment is now managed by nix-darwin."
echo ""
echo "To make changes:"
echo "  1. Edit configuration files in their original locations (.vimrc, .gitconfig, etc.)"
echo "  2. Edit packages/apps in flake.nix"
echo "  3. Run: darwin-rebuild switch --flake .#Jordans-MacBook-Pro"
echo ""
echo "Restart your terminal to ensure all changes take effect."
