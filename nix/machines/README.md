# Machine-Specific Configurations

This directory contains machine-specific configuration overrides.

## Usage

### Personal MacBook
```bash
darwin-rebuild switch --flake .#personal-macbook
```

### Work MacBook (with external work config)
1. Clone your private work config repo alongside this one
2. Create a symlink or import in flake.nix:
   ```nix
   modules = [ 
     darwinConfig
     ../work-dotfiles/nix/work-config.nix  # External repo
   ];
   ```
3. Build: `darwin-rebuild switch --flake .#work-macbook`

### Arch Linux PC
```bash
home-manager switch --flake .#jordan@arch-pc
```

## Adding New Machines

1. Add configuration to `darwinConfigurations` or `homeConfigurations` in flake.nix
2. Create machine-specific config file in this directory if needed
3. Import in main flake.nix

## External Configuration Merging

For work laptops with private configurations:
- Keep sensitive work config in a separate private repository
- Import work config modules into the work machine configuration
- Use nix module system to override or extend base configuration