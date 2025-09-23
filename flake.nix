{
  description = "Example nix-darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:nix-darwin/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs@{ self, nix-darwin, nixpkgs }:
  let
    configuration = { pkgs, ... }: {
      imports = [
        ./nix/modules/dotfiles.nix
        ./nix/modules/languages.nix
        ./nix/modules/shell.nix
      ];
      # List packages installed in system profile. To search by name, run:
      # $ nix-env -qaP | grep wget
      environment.systemPackages = with pkgs; [
        # Core CLI tools (migrated from brew.sh)
        bat
        eza
        ripgrep
        fd
        delta
        gh
        neovim
        bottom
        pandoc
        zellij
        lazygit

        # Development tools
        gnupg
        openssl
        # Note: node, nvm, asdf will be handled separately with language management

        # Network/security tools
        tor
        colima

        # Keep vim for now (was in original flake)
        vim
      ];

      # Homebrew configuration for GUI applications
      homebrew = {
        enable = true;

        # GUI Applications (migrated from mac-defaults.sh)
        casks = [
          "visual-studio-code"
          "ghostty"
          "dbeaver-community" 
          "obsidian"
          "1password"
          "discord"
          "brave-browser"
          "protonvpn"
          "vlc"
          "zoom"
        ];

        # Clean up orphaned casks
        onActivation.cleanup = "zap";
      };

      # Set primary user for homebrew and other user-specific features
      system.primaryUser = "jordan";

      # Necessary for using flakes on this system.
      nix.settings.experimental-features = "nix-command flakes";

      # Enable zsh with basic settings only
      programs.zsh = {
        enable = true;
        enableCompletion = true;
      };

      # Set Git commit hash for darwin-version.
      system.configurationRevision = self.rev or self.dirtyRev or null;

      # Used for backwards compatibility, please read the changelog before changing.
      # $ darwin-rebuild changelog
      system.stateVersion = 6;

      # The platform the configuration will be used on.
      nixpkgs.hostPlatform = "aarch64-darwin";
    };
  in
  {
    # Build darwin flake using:
    # $ darwin-rebuild build --flake .#Jordans-MacBook-Pro
    darwinConfigurations."Jordans-MacBook-Pro" = nix-darwin.lib.darwinSystem {
      modules = [ configuration ];
    };
  };
}
