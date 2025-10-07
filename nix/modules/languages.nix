{ config, pkgs, ... }:

{
  # Language version managers and development tools
  environment.systemPackages = with pkgs; [
    # Ruby version management
    chruby          # Ruby version manager (supports .ruby-version files)

    # Node.js version management
    # Using nodejs-slim for faster installation (uses binary cache)
    # npm/yarn/pnpm can be enabled via: corepack enable
    nodejs-slim
    corepack        # Package manager manager (enables npm, yarn, pnpm)

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
