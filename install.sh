#!/usr/bin/env bash

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
    
    # Configuration selection
    CONFIG="${DOTFILES_DARWIN_CONFIG:-personal-macbook}"
    
    echo "📱 Using configuration: $CONFIG"
    echo ""

    # Check sudo privileges
    echo "🔐 Checking sudo privileges..."
    if ! sudo -n true 2>/dev/null; then
        echo "   You'll be prompted for your password to run system activation scripts."
    else
        echo "✅ Sudo privileges confirmed"
    fi
    echo ""

    # Needed to install "unfree" pacakages (whatever the heck that means)
    export NIXPKGS_ALLOW_UNFREE=1 

    echo "🔧 Building nix-darwin configuration..."
    if darwin-rebuild build --flake .#$CONFIG --impure; then
        echo "✅ Build successful!"
    else
        echo "❌ Build failed. Please check the error messages above."
        exit 1
    fi

    echo ""
    echo "🔄 Switching to new configuration..."
    echo "   Note: This requires sudo privileges to run system activation scripts."
    if sudo -E darwin-rebuild switch --flake .#$CONFIG --impure; then
        echo "✅ Configuration activated!"
        echo "   All dotfile symlinks and system configurations have been applied."
    else
        echo "❌ Switch failed. Please check the error messages above."
        echo "   Make sure you have sudo privileges and that all dependencies are installed."
        exit 1
    fi

    echo ""
    echo "🎉 macOS setup complete! Your development environment is now managed by nix-darwin."
    echo "   ✅ All dotfile symlinks have been created"
    echo "   ✅ System packages and applications have been installed"
    echo "   ✅ Configuration files are now managed by nix-darwin"
    echo ""
    echo "To make changes:"
    echo "  1. Edit configuration files in their original locations (.vimrc, .gitconfig, etc.)"
    echo "  2. Edit packages/apps in flake.nix"
    echo "  3. Run: sudo darwin-rebuild switch --flake .#$CONFIG"
    echo "     (sudo is required for system activation scripts and dotfile symlinks)"
    
elif [[ "$PLATFORM" == "linux" ]]; then
    # Linux setup with home-manager

    # Ensure the current shell session has the nix environment (if already installed).
    if [[ -e "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh" ]]; then
        # shellcheck disable=SC1091
        . "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh"
    fi

    # Ensure Nix is installed (daemon mode) and flakes are enabled.
    if ! command -v nix &> /dev/null; then
        echo "ℹ️  Nix not found; installing (multi-user daemon mode)"
        if ! sh <(curl -L https://nixos.org/nix/install) --daemon; then
            echo "❌ Nix installer failed. See output above."
            echo "If you saw a message about /etc/bash.bashrc.backup-before-nix already existing,"
            echo "you likely have remnants of a previous install; restore /etc/bash.bashrc per the installer instructions and retry."
            exit 1
        fi

        # Re-source nix environment after installing.
        if [[ -e "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh" ]]; then
            # shellcheck disable=SC1091
            . "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh"
        fi
    fi

    if ! command -v nix &> /dev/null; then
        echo "❌ Nix is still not available in PATH after install."
        echo "   Try opening a new terminal, or run:"
        echo "   . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh"
        exit 1
    fi

    echo "✅ Nix is installed"

    mkdir -p "$HOME/.config/nix"
    if [[ ! -e "$HOME/.config/nix/nix.conf" ]] || ! grep -qE '(^|\s)experimental-features\s*=.*flakes' "$HOME/.config/nix/nix.conf" 2>/dev/null; then
        echo "ℹ️  Enabling nix-command + flakes (user config)"
        echo 'experimental-features = nix-command flakes' >> "$HOME/.config/nix/nix.conf"
    fi

    if command -v sudo &> /dev/null && sudo -n true >/dev/null 2>&1; then
        if [[ ! -e "/etc/nix/nix.conf" ]] || ! sudo grep -qE '(^|\s)experimental-features\s*=.*flakes' /etc/nix/nix.conf 2>/dev/null; then
            echo "ℹ️  Enabling nix-command + flakes (system config)"
            sudo mkdir -p /etc/nix
            echo 'experimental-features = nix-command flakes' | sudo tee -a /etc/nix/nix.conf >/dev/null
        fi
    fi

    # Verify flake support is usable (fail fast with the real error).
    if ! nix flake metadata . >/dev/null 2>&1; then
        echo "❌ Nix flakes are not working yet. Error:"
        nix flake metadata . 2>&1 | sed 's/^/   /'
        echo ""
        echo "If this is a fresh install, try opening a new terminal and rerun ./install.sh"
        exit 1
    fi

    # If we're running from a git checkout with untracked files, flakes won't see them.
    if command -v git &> /dev/null && git -C . rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        if git -C . status --porcelain=v1 2>/dev/null | grep -q '^?? '; then
            echo "⚠️  Git tree has untracked files. Nix flakes will NOT see them until you git add/commit."
            echo "   Untracked files:"
            git -C . status --porcelain=v1 | sed -n 's/^?? /     - /p'
            echo ""
        fi
    fi

    if command -v systemctl &> /dev/null; then
        # Nix daemon is required for --daemon installs; enable if needed.
        if systemctl list-unit-files 2>/dev/null | grep -qE '^nix-daemon(\.service)?\s'; then
            sudo systemctl enable --now nix-daemon >/dev/null 2>&1 || true
            sudo systemctl restart nix-daemon >/dev/null 2>&1 || true
        fi
    fi
    
    # Ensure home-manager command is available (flake-based wrapper)
    if ! command -v home-manager &> /dev/null; then
        echo "ℹ️  home-manager not found; creating wrapper at ~/.local/bin/home-manager"
        mkdir -p "$HOME/.local/bin"
        cat > "$HOME/.local/bin/home-manager" <<'EOF'
#!/usr/bin/env bash
exec nix run home-manager -- "$@"
EOF
        chmod +x "$HOME/.local/bin/home-manager"
        export PATH="$HOME/.local/bin:$PATH"
    fi

    echo "✅ home-manager is available"
    echo ""

    # Resolve Linux home-manager configuration
    USERNAME=$(whoami)
    HOSTNAME=$(hostname)

    CANDIDATES=("$USERNAME@$HOSTNAME" "jordan@$HOSTNAME" "jordan@omarchy")

    # De-duplicate candidates (bash associative array).
    declare -A SEEN
    UNIQUE_CANDIDATES=()
    for candidate in "${CANDIDATES[@]}"; do
        if [[ -z "${SEEN[$candidate]:-}" ]]; then
            SEEN[$candidate]=1
            UNIQUE_CANDIDATES+=("$candidate")
        fi
    done

    declare -A EVAL_ERRORS
    for candidate in "${UNIQUE_CANDIDATES[@]}"; do
        eval_out=$(nix eval --quiet ".#homeConfigurations.\"$candidate\".activationPackage.drvPath" 2>&1) || true
        if [[ -n "$eval_out" ]] && [[ "$eval_out" != warning:* ]]; then
            EVAL_ERRORS[$candidate]="$eval_out"
        fi

        if [[ -n "$eval_out" ]] && [[ "$eval_out" == */nix/store/* ]]; then
            CONFIG="$candidate"
            break
        fi
    done

    if [[ -z "$CONFIG" ]]; then
        echo "❌ No matching home-manager configuration found. Tried:"
        printf '  - %s\n' "${UNIQUE_CANDIDATES[@]}"
        echo ""
        echo "Available homeConfigurations in this flake:"
        nix eval --json .#homeConfigurations --apply 'x: builtins.attrNames x' 2>/dev/null \
          | python -c 'import json,sys; print("\n".join(["  - "+x for x in json.load(sys.stdin)]))' 2>/dev/null \
          || echo "  (unable to list; run: nix flake show .)"
        echo ""

        # Surface the most common failure cause.
        for candidate in "${UNIQUE_CANDIDATES[@]}"; do
            if [[ "${EVAL_ERRORS[$candidate]:-}" == *"is not tracked by Git"* ]]; then
                echo "Likely cause: this repo has new/untracked files; flakes only see git-tracked files."
                echo "Fix: git add -A && git commit (or at least git add the new nix files), then rerun."
                echo ""
                break
            fi
        done

        # Print one eval error for debugging.
        for candidate in "${UNIQUE_CANDIDATES[@]}"; do
            if [[ -n "${EVAL_ERRORS[$candidate]:-}" ]]; then
                echo "nix eval error for $candidate:"
                echo "${EVAL_ERRORS[$candidate]}" | sed 's/^/   /'
                echo ""
                break
            fi
        done

        echo "Add a matching entry under 'homeConfigurations' in flake.nix."
        exit 1
    fi

    echo "🐧 Using Linux configuration: $CONFIG"
    echo ""

    echo "🔧 Building home-manager configuration..."
    if home-manager build --flake .#$CONFIG; then
        echo "✅ Build successful!"
    else
        echo "❌ Build failed. Please check the error messages above."
        exit 1
    fi

    echo ""
    echo "🔄 Switching to new configuration..."
    if home-manager switch -b backup-before-home-manager --flake .#$CONFIG; then
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
