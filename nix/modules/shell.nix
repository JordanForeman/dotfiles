{ config, pkgs, ... }:

let
  # Read base configuration files
  baseZshrc = builtins.readFile ../../.zshrc;
  aliases = builtins.readFile ../../.aliases;
  
  # Compose the final .zshrc from multiple parts
  composedZshrc = ''
    # Base zsh configuration (from .zshrc)
    ${baseZshrc}
    
    # Aliases (from .aliases) 
    ${aliases}
    
    # Nix-managed language environment setup
    # chruby setup (supports .ruby-version files automatically)
    source ${pkgs.chruby}/share/chruby/chruby.sh
    source ${pkgs.chruby}/share/chruby/auto.sh
    
    # NVM setup (supports .nvmrc files automatically) 
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/bash_completion"
    
    # Go environment
    export GOPATH="$HOME/go"
    export PATH="$PATH:$GOPATH/bin"
    
    # Bun environment
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    
    # Shadowenv (project environment management)
    if command -v shadowenv &> /dev/null; then
      eval "$(shadowenv init zsh)"
    fi
  '';
in
{
  # Shell configuration - composed from multiple sources
  environment.etc."zshrc-composed".text = composedZshrc;
  
  system.activationScripts.shell.text = ''
    # Use the nix-composed .zshrc
    ln -sf /etc/zshrc-composed ~/.zshrc
    
    # Keep .aliases as a separate file for reference (optional)
    ln -sf "${builtins.toString ../../.aliases}" ~/.aliases
  '';
}