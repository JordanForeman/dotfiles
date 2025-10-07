{ config, pkgs, ... }:

{
  # Language version managers and development tools
  environment.systemPackages = with pkgs; [
    # Ruby version management
    chruby          # Ruby version manager (supports .ruby-version files)

    # Node.js version management  
    nodejs          # Default Node.js (fallback)
    nodePackages.npm

    # Other language runtimes (single versions)
    python3         # Latest Python 3
    python3Packages.pip
    go              # Latest stable Go

    # Development tools
    bun             # Fast JS runtime & package manager

    # Agentic Coding
    opencode

    # Rust
    rustc
    cargo
  ];

}
