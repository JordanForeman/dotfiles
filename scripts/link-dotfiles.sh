#!/bin/zsh

# List of dotfiles to symlink
dotfiles=(
    ".vscode/User/settings.json"
    ".zshrc"
    ".aliases"
    ".vimrc"
    ".tmux.conf"
    ".vim"
    ".gitconfig"
    ".asdfrc"
)

# Loop through each file
for file in "${dotfiles[@]}"; do
    # Create a symlink in the home directory, pointing to the current file
    echo "Creating symlink for $file"
    ln -sf "$(pwd)/$file" "$HOME/$file"
done

echo "Symlinks created successfully"
