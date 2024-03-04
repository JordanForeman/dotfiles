#!/bin/zsh

touch ~/.profile

write_to_file() {
    local line="$1"
    local file="$2"
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
