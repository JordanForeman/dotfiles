grep -qxF "source "$(pwd)"/ext/zsh-autocomplete/zsh-autocomplete.plugin.zsh" ~/.profile || echo "source "$(pwd)"/ext/zsh-autocomplete/zsh-autocomplete.plugin.zsh" >> ~/.profile
grep -qxF "source $(pwd)/ext/zsh-autosuggestions/zsh-autosuggestions.zsh" ~/.profile || echo "source $(pwd)/ext/zsh-autosuggestions/zsh-autosuggestions.zsh" >> ~/.profile
