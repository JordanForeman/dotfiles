# 😱 OMZ
export ZSH="$HOME/.oh-my-zsh"
if [[ -f "$ZSH/oh-my-zsh.sh" ]]; then
    source "$ZSH/oh-my-zsh.sh"
fi

# Which plugins would you like to load?
# Standard plugins can be found in $ZSH/plugins/
# Custom plugins may be added to $ZSH_CUSTOM/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(git)

# Nix profile paths for C/C++ compilation
export CPATH="$HOME/.nix-profile/include"
export LIBRARY_PATH="$HOME/.nix-profile/lib"

# Zsh plugins (managed by Nix)

# ── zsh-autocomplete performance tuning (must be set BEFORE sourcing) ──
# Abort async completion if it takes longer than 500ms (default: 1.0s).
# This is the main fix for git operations hanging in large monorepos.
zstyle ':autocomplete:*' timeout 0.5
# Increase debounce to 100ms so fast typing doesn't trigger wasteful completions
zstyle ':autocomplete:*' delay 0.1
# Require at least 2 chars before showing completions (reduces noise)
zstyle ':autocomplete:*' min-input 2

# Find and source zsh-autocomplete
for plugin_path in $HOME/.nix-profile/share/zsh-autocomplete/zsh-autocomplete.plugin.zsh \
                   /nix/var/nix/profiles/default/share/zsh-autocomplete/zsh-autocomplete.plugin.zsh \
                   /run/current-system/sw/share/zsh-autocomplete/zsh-autocomplete.plugin.zsh; do
    if [[ -f "$plugin_path" ]]; then
        source "$plugin_path"
        break
    fi
done

# ── zsh-autosuggestions performance tuning (must be set BEFORE sourcing) ──
# Don't fetch suggestions for buffers longer than 20 chars (avoids slow lookups)
ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=20
# Skip rebinding widgets on every precmd (minor but free speedup)
ZSH_AUTOSUGGEST_MANUAL_REBIND=1

# Find and source zsh-autosuggestions
for plugin_path in $HOME/.nix-profile/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
                   /nix/var/nix/profiles/default/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
                   /run/current-system/sw/share/zsh-autosuggestions/zsh-autosuggestions.zsh; do
    if [[ -f "$plugin_path" ]]; then
        source "$plugin_path"
        break
    fi
done

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

# Starship prompt (if installed)
if command -v starship &> /dev/null; then
    eval "$(starship init zsh)"
fi

# Shadowenv
if command -v shadowenv &> /dev/null; then
    eval "$(shadowenv init zsh)"
fi

# 🧑‍💻 NVM Configuration
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Homebrew-installed NVM (macOS)
[ -s "/usr/local/opt/nvm/nvm.sh" ] && \. "/usr/local/opt/nvm/nvm.sh"
[ -s "/usr/local/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/usr/local/opt/nvm/etc/bash_completion.d/nvm"

# Load Aliases
if [ -f ~/.aliases ]; then
    . ~/.aliases
fi

# Local settings
if [ -f ~/.profile ]; then
    source ~/.profile
fi

# bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
export PATH="$HOME/.npm-global/bin:$BUN_INSTALL/bin:$PATH"
[[ -d "/usr/local/sbin" ]] && export PATH="/usr/local/sbin:$PATH"

# [[ -x /opt/homebrew/bin/brew ]] && eval $(/opt/homebrew/bin/brew shellenv)

[ -f /opt/dev/dev.sh ] && source /opt/dev/dev.sh

# Added by Windsurf
[[ -d "$HOME/.codeium/windsurf/bin" ]] && export PATH="$HOME/.codeium/windsurf/bin:$PATH"
[[ -x "$HOME/.claude/local/claude" ]] && alias claude="$HOME/.claude/local/claude"

# Make Go binaries available
export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin

# Dotfiles-managed shell fragments (host-specific)
for fragment in "$HOME"/.config/dotfiles/shell/*.zsh(N); do
    source "$fragment"
done

# Machine-specific configuration (not in dotfiles)
# Create ~/.zshrc.local for work-specific initialization, custom paths, etc.
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local
