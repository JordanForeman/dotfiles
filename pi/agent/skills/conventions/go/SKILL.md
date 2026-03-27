---
name: go
description: Go project guidance
injection: detect
detect:
  files: [go.mod]
---

- Follow idiomatic Go: clear package boundaries, explicit errors, and minimal magic.
- Prefer straightforward functions and structs over unnecessary abstraction layers.
- Keep formatting/tooling compatibility with gofmt/go test expectations.
- Avoid introducing hidden control flow or reflection-heavy patterns without clear need.
