---
name: nix
description: Nix expression guidance
injection: detect
detect:
  files: [flake.nix, default.nix, shell.nix]
---

- Follow existing Nix expression style (indentation, attribute ordering).
- Prefer nixpkgs conventions for package overrides and overlays.
- Keep flake inputs minimal; avoid unnecessary indirection.
- Test builds before switching when possible.
- Be explicit about system/platform dependencies.
