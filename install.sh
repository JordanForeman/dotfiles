#!/bin/zsh

touch ~/.profile

write_to_file() {
    local file="$1"
    local line="$2"
    grep -qxF "$line" "$file" || echo "$line" >> "$file"
}
# Export the function so it is globally available
export -f write_to_file

for script in ./scripts/*.sh
do
    if [ -f "$script" ]; then
        chmod +x "$script"
        . "$script" "$@"
    fi
done

source ~/.zshrc
