# 😱 OMZ
export ZSH="$HOME/.oh-my-zsh"
source $ZSH/oh-my-zsh.sh

# Which plugins would you like to load?
# Standard plugins can be found in $ZSH/plugins/
# Custom plugins may be added to $ZSH_CUSTOM/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(git)

# 🍻 Ensure brew is ready to go for linux
if [[ "$(uname)" == "Linux" ]]; then
    test -d ~/.linuxbrew && eval "$(~/.linuxbrew/bin/brew shellenv)"
    test -d /home/linuxbrew/.linuxbrew && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi


PS1="%F{184} %f"

# Zellij
export ZELLIJ_CONFIG_FILE="$HOME/.config/zellij/config.kdl"
export DISABLE_AUTO_TITLE="true"
precmd() {
    echo -n -e "\033]0;$(pwd)\007"
}
eval "$(zellij setup --generate-auto-start zsh)"

# ASDF
. $(brew --prefix asdf)/libexec/asdf.sh

# 🧑‍💻 NVM Configuration
export NVM_DIR="/Users/jordan/.nvm"
[ -s "/usr/local/opt/nvm/nvm.sh" ] && \. "/usr/local/opt/nvm/nvm.sh"
[ -s "/usr/local/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/usr/local/opt/nvm/etc/bash_completion.d/nvm"

# Load Aliases
if [ -f ~/.aliases ]; then
    . ~/.aliases
fi

# Local settings
source ~/.profile

# bun completions
[ -s "/Users/jordan/.bun/_bun" ] && source "/Users/jordan/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
