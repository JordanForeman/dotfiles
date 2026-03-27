---
name: rust
description: Rust project guidance
injection: detect
detect:
  files: [Cargo.toml]
---

- Follow idiomatic Rust: ownership, borrowing, and lifetime conventions.
- Prefer Result/Option over panicking for recoverable errors.
- Keep unsafe blocks minimal and well-documented.
- Respect existing Cargo.toml structure and feature flags.
- Run clippy/rustfmt conventions as established in the project.
