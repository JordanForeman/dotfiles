echo "Installing Oh My ZSH!"
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "Bun is not installed. Installing..."

    # Install Bun
    curl -fsSL https://bun.sh/install | bash

    # Check if Bun was installed successfully
    if command -v bun &> /dev/null; then
        echo "Bun was installed successfully!"
    else
        echo "Failed to install Bun."
        exit 1
    fi
else
    echo "Bun is already installed."
fi
