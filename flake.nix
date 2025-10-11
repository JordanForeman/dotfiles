{
  description = "Jordan's multi-platform development environment";

  # Configure binary caches to avoid building from source
  nixConfig = {
    extra-substituters = [
      "https://cache.nixos.org"
    ];
    extra-trusted-public-keys = [
      "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
    ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    
    # macOS support
    nix-darwin.url = "github:nix-darwin/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
    
    # User environment management (works on both macOS and Linux)
    home-manager.url = "github:nix-community/home-manager";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs@{ self, nixpkgs, nix-darwin, home-manager }:
  let
    # Supported systems
    supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    
    # Helper function to generate configs for each system
    forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    
    # Common package names (system-agnostic)
    commonPackageNames = [
      "bat" "eza" "ripgrep" "fd" "delta" "gh" "neovim" 
      "bottom" "pandoc" "zellij" "lazygit" "gnupg" "openssl" "tor" "vim"
    ];
    
    # Common configuration shared across all machines
    commonModules = [
      ./nix/modules/dotfiles.nix
      ./nix/modules/languages.nix  
      ./nix/modules/shell.nix
    ];
    
    # macOS-specific configuration
    darwinConfig = { pkgs, ... }: {
      imports = commonModules;
      
      # macOS packages  
      environment.systemPackages = (map (name: pkgs.${name}) commonPackageNames) ++ (with pkgs; [
        colima  # macOS-specific container runtime
      ]);

      # Homebrew for GUI applications (macOS only)
      homebrew = {
        enable = true;
        taps = [
          "FelixKratz/formulae"
          "nikitabobko/tap"
        ];
        brews = [
          {
            name = "sketchybar";
            start_service = true;
          }
        ];
        casks = [
          "visual-studio-code" "ghostty" "dbeaver-community" 
          "obsidian" "1password" "discord" "brave-browser"
          "protonvpn" "vlc" "zoom" "nikitabobko/tap/aerospace"
        ];
        onActivation.cleanup = "zap";
      };

      system.primaryUser = "jordan";
      nix.settings.experimental-features = "nix-command flakes";
      programs.zsh = { enable = true; enableCompletion = true; };
      system.configurationRevision = self.rev or self.dirtyRev or null;
      system.stateVersion = 6;
    };
    
    # Linux-specific configuration  
    linuxConfig = { pkgs, ... }: {
      imports = commonModules;
      
      # Linux packages
      home.packages = (map (name: pkgs.${name}) commonPackageNames) ++ (with pkgs; [
        # Linux-specific tools
        hyprland  # Your window manager
        # Add other Linux-specific packages
      ]);
      
      home.stateVersion = "25.05";
    };
    
  in
  {
    # macOS configurations
    darwinConfigurations = {
      # Personal MacBook
      "personal-macbook" = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        modules = [ 
          darwinConfig
          # Personal-specific overrides can go here
        ];
      };
      
      # Work MacBook (for external config merging)
      "work-macbook" = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin"; 
        modules = [ 
          darwinConfig
          # Work-specific config would be imported here
          # ./work/work-config.nix  # From separate repo
        ];
      };
      
      # Legacy name for backward compatibility
      "Jordans-MacBook-Pro" = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        modules = [ darwinConfig ];
      };
    };
    
    # Linux configurations (using home-manager)
    homeConfigurations = {
      # Arch Linux + Hyprland
      "jordan@arch-pc" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.x86_64-linux;
        modules = [
          linuxConfig
          # Linux-specific dotfiles and configs
        ];
      };
    };
    
    # Development shells for any system
    devShells = forAllSystems (system: 
      let pkgs = nixpkgs.legacyPackages.${system};
      in {
        default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bat eza ripgrep fd delta gh neovim bottom 
            pandoc zellij lazygit gnupg openssl tor vim
          ];
        };
      }
    );
  };
}
