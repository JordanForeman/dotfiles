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

# Function to get the current git branch
git_branch() {
    git symbolic-ref --short HEAD 2>/dev/null | sed 's/^/ %F{13}(/' | sed 's/$/)%f/'
}

# Set the prompt
setopt PROMPT_SUBST
PS1='
%F{14}%n%f %F{11}[%m]%f %1~$(git_branch)
%F{10}󰄾%f '

# Shadowenv
eval "$(shadowenv init zsh)"

# chruby
source $HOMEBREW_PREFIX/opt/chruby/share/chruby/chruby.sh
source $HOMEBREW_PREFIX/opt/chruby/share/chruby/auto.sh

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
export PATH="/usr/local/sbin:$PATH"

[[ -x /opt/homebrew/bin/brew ]] && eval $(/opt/homebrew/bin/brew shellenv)

[[ -f /opt/dev/sh/chruby/chruby.sh ]] && { type chruby >/dev/null 2>&1 || chruby () { source /opt/dev/sh/chruby/chruby.sh; chruby "$@"; } }

[ -f /opt/dev/dev.sh ] && source /opt/dev/dev.sh

# Added by Windsurf
export PATH="/Users/jordan/.codeium/windsurf/bin:$PATH"
alias claude="/Users/jordan/.claude/local/claude"

# Make Go binaries available
export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin
