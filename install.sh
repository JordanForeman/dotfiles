#!/bin/zsh

echo "🚀 Setting up Jordan's multi-platform development environment..."
echo ""

# Detect the operating system
OS=$(uname -s)
ARCH=$(uname -m)

# Determine system type
case "$OS" in
    "Darwin")
        PLATFORM="darwin"
        if [[ "$ARCH" == "arm64" ]]; then
            SYSTEM="aarch64-darwin"
        else
            SYSTEM="x86_64-darwin"
        fi
        ;;
    "Linux")
        PLATFORM="linux"
        if [[ "$ARCH" == "x86_64" ]]; then
            SYSTEM="x86_64-linux"
        else
            SYSTEM="aarch64-linux"
        fi
        ;;
    *)
        echo "❌ Unsupported operating system: $OS"
        exit 1
        ;;
esac

echo "📋 Detected platform: $PLATFORM ($SYSTEM)"

# Check if nix is installed
if ! command -v nix &> /dev/null; then
    echo "❌ Nix is not installed. Please install it first:"
    echo "curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install"
    exit 1
fi

echo "✅ Nix is installed"

# Platform-specific setup
if [[ "$PLATFORM" == "darwin" ]]; then
    # macOS setup with nix-darwin
    
    # Check if darwin-rebuild is available
    if ! command -v darwin-rebuild &> /dev/null; then
        echo "❌ nix-darwin is not available. Please install it first or restart your shell."
        exit 1
    fi

    echo "✅ nix-darwin is available"
    echo ""
    
    # Determine which configuration to use
    echo "🤔 Which machine configuration would you like to use?"
    echo "  1) personal-macbook (default)"
    echo "  2) work-macbook"
    echo "  3) Jordans-MacBook-Pro (legacy)"
    echo ""
    read -p "Enter your choice (1-3) [1]: " choice
    case ${choice:-1} in
        1) CONFIG="personal-macbook" ;;
        2) CONFIG="work-macbook" ;;
        3) CONFIG="Jordans-MacBook-Pro" ;;
        *) CONFIG="personal-macbook" ;;
    esac
    
    echo "📱 Using configuration: $CONFIG"
    echo ""

    echo "🔧 Building nix-darwin configuration..."
    if darwin-rebuild build --flake .#$CONFIG; then
        echo "✅ Build successful!"
    else
        echo "❌ Build failed. Please check the error messages above."
        exit 1
    fi

    echo ""
    echo "🔄 Switching to new configuration..."
    if sudo -E darwin-rebuild switch --flake .#$CONFIG; then
        echo "✅ Configuration activated!"
    else
        echo "❌ Switch failed. Please check the error messages above."
        exit 1
    fi

    echo ""
    echo "🎉 macOS setup complete! Your development environment is now managed by nix-darwin."
    echo ""
    echo "To make changes:"
    echo "  1. Edit configuration files in their original locations (.vimrc, .gitconfig, etc.)"
    echo "  2. Edit packages/apps in flake.nix"
    echo "  3. Run: darwin-rebuild switch --flake .#$CONFIG"
    
elif [[ "$PLATFORM" == "linux" ]]; then
    # Linux setup with home-manager
    
    # Check if home-manager is available
    if ! command -v home-manager &> /dev/null; then
        echo "❌ home-manager is not available. Installing it now..."
        nix run home-manager/master -- init --switch
        if [[ $? -ne 0 ]]; then
            echo "❌ Failed to install home-manager. Please install manually."
            exit 1
        fi
    fi

    echo "✅ home-manager is available"
    echo ""

    # Get username for configuration
    USERNAME=$(whoami)
    CONFIG="$USERNAME@$(hostname)"
    
    echo "🐧 Using Linux configuration: $CONFIG"
    echo ""

    echo "🔧 Building home-manager configuration..."
    if home-manager build --flake .#$CONFIG; then
        echo "✅ Build successful!"
    else
        echo "❌ Build failed. You may need to create a configuration for: $CONFIG"
        echo "   Or use: home-manager switch --flake .#jordan@arch-pc"
        exit 1
    fi

    echo ""
    echo "🔄 Switching to new configuration..."
    if home-manager switch --flake .#$CONFIG; then
        echo "✅ Configuration activated!"
    else
        echo "❌ Switch failed. Please check the error messages above."
        exit 1
    fi

    echo ""
    echo "🎉 Linux setup complete! Your development environment is now managed by home-manager."
    echo ""
    echo "To make changes:"
    echo "  1. Edit configuration files in their original locations (.vimrc, .gitconfig, etc.)"
    echo "  2. Edit packages in flake.nix"  
    echo "  3. Run: home-manager switch --flake .#$CONFIG"
fi

echo ""
echo "Restart your terminal to ensure all changes take effect."
