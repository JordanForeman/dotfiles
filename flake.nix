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

    # SQL TUI (uses its own nixpkgs pin for compatible Python deps)
    sqlit.url = "github:Maxteabag/sqlit";

    # Zellij statusbar plugin
    zjstatus.url = "github:dj95/zjstatus";
  };

  outputs = inputs@{ self, nixpkgs, nix-darwin, home-manager, sqlit, zjstatus }:
  let
    # Supported systems
    supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];

    # Helper function to generate configs for each system
    forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

    # Common package names (system-agnostic)
    commonPackageNames = [
      "bat" "eza" "ripgrep" "fd" "delta" "gh" "neovim"
      "bottom" "pandoc" "zellij" "lazygit" "gnupg" "openssl" "tor" "vim"
      "lazydocker"
    ];

    # Common Home Manager configuration (macOS + Linux)
    homeManagerCommonModules = [ ./nix/home/common.nix ];

    mkDarwin = extraHmModules: nix-darwin.lib.darwinSystem {
      system = "aarch64-darwin";
      modules = [
        darwinConfig
        home-manager.darwinModules.home-manager
        {
          home-manager.useGlobalPkgs = true;
          home-manager.useUserPackages = true;
          home-manager.backupFileExtension = "backup";
          home-manager.extraSpecialArgs = {
            sqlit = sqlit.packages.aarch64-darwin.default;
            zjstatus = zjstatus.packages.aarch64-darwin.default;
          };
          home-manager.users.jordan = {
            home = {
              username = "jordan";
              homeDirectory = "/Users/jordan";
              stateVersion = "25.05";
            };
            imports = homeManagerCommonModules ++ extraHmModules;
          };

          users.users.jordan = {
            name = "jordan";
            home = "/Users/jordan";
          };
        }
      ];
    };

    # macOS-specific system configuration (nix-darwin)
    darwinConfig = { pkgs, ... }: {
      # macOS system packages
      environment.systemPackages = (map (name: pkgs.${name}) commonPackageNames) ++ (with pkgs; [
        colima
        mariadb
        libmysqlclient
        openssl_3
        claude-code
      ]);

      # Homebrew for GUI applications (macOS only)
      homebrew = {
        enable = true;
        taps = [
          "FelixKratz/formulae"
          "nikitabobko/tap"
        ];
        brews = [
          "starship"
          "borders"
          {
            name = "sketchybar";
            start_service = true;
          }
        ];
        casks = [
          "visual-studio-code" "ghostty" "dbeaver-community"
          "obsidian" "1password" "discord" "brave-browser"
          "protonvpn" "vlc" "zoom" "nikitabobko/tap/aerospace"
          "macwhisper"
        ];
        onActivation.cleanup = "zap";
      };

      system.primaryUser = "jordan";
      nix.settings.experimental-features = "nix-command flakes";
      programs.zsh = { enable = true; enableCompletion = true; };
      system.configurationRevision = self.rev or self.dirtyRev or null;
      system.stateVersion = 6;
    };

  in
  {
    # macOS configurations
    darwinConfigurations = {
      "personal-macbook" = mkDarwin [ ./nix/home/darwin.nix ];
      "work-macbook" = mkDarwin [ ./nix/home/darwin.nix ];
      "Jordans-MacBook-Pro" = mkDarwin [ ./nix/home/darwin.nix ];
    };

    # Home Manager configurations (including Shopify MacBook)
    homeConfigurations = {
      # Shopify MacBook - Home Manager only (no nix-darwin) 
      "jordan@shopify-macbook" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        extraSpecialArgs = {
          sqlit = sqlit.packages.aarch64-darwin.default;
          zjstatus = zjstatus.packages.aarch64-darwin.default;
        };
        modules = [
          {
            home = {
              username = "jordan";
              homeDirectory = "/Users/jordan";
              stateVersion = "25.05";
            };
          }
        ] ++ homeManagerCommonModules ++ [
          ./nix/home/shopify-macbook.nix
        ];
      };

      # Omarchy (Arch Linux) - desktop remains Omarchy-managed
      "jordan@omarchy" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.x86_64-linux;
        extraSpecialArgs = {
          sqlit = sqlit.packages.x86_64-linux.default;
          zjstatus = zjstatus.packages.x86_64-linux.default;
        };
        modules = [
          {
            home = {
              username = "jordan";
              homeDirectory = "/home/jordan";
              stateVersion = "25.05";
            };
          }
        ] ++ homeManagerCommonModules ++ [
          ./nix/home/omarchy.nix
        ];
      };

      # Generic Linux host (replace hostname and homeDirectory as needed)
      "jordan@arch-pc" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.x86_64-linux;
        extraSpecialArgs = {
          sqlit = sqlit.packages.x86_64-linux.default;
          zjstatus = zjstatus.packages.x86_64-linux.default;
        };
        modules = [
          {
            home = {
              username = "jordan";
              homeDirectory = "/home/jordan";
              stateVersion = "25.05";
            };
          }
        ] ++ homeManagerCommonModules;
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
