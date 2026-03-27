---
name: ruby
description: Ruby/Rails project guidance
injection: detect
detect:
  files: [Gemfile, .ruby-version, config/application.rb]
---

- Follow existing Ruby/Rails conventions in naming, structure, and idioms.
- Prefer small, intention-revealing methods over broad abstractions.
- Keep behavior changes consistent with existing tests and callback/validation patterns.
- Avoid incidental framework-wide rewrites for narrow feature requests.
