---
name: api-design
description: Designing or authoring classes, types, modules, or public interfaces where surface area and design vocabulary matter
injection: classify
---

Classes and types are nouns with design intention. A well-designed type has a clear role its name communicates, and a deliberate boundary between what it exposes and what it hides. This taste applies when you're *shaping an interface* — not on every edit.

### Design vocabulary carries meaning

- Name types after what they *are* or the role they *play*: `RetryPolicy`, `OrderSerializer`, `PaymentGateway`. Avoid generic suffixes like `Service`, `Manager`, `Handler` unless the type genuinely has no narrower role.
- Apply design vocabulary when it fits naturally — facades, adapters, factories, policies, builders. These names tell the reader *how* the type participates in the system, not just *that* it exists. Vocabulary should clarify, not add ceremony.

### Public surface is the narrative; private surface is the vocabulary

- A type should have both public and private surface area. The public API is what this object does for its collaborators; the private API is the named internal pieces the public methods compose.
- A type with no private methods likely hasn't been designed — it just grew. A type where every method is public likely has no encapsulation boundary.
- **Do not widen the public surface solely to enable testing.** Exposing internals to make them unit-testable conflates the public contract with test-only needs and erodes cohesion. Test through the public API, or restructure so the unit you want to test *is* a legitimate collaborator.

### Prefer many small, focused types

- Prefer many small, focused classes over few large ones. When a type accumulates unrelated responsibilities, extract a collaborator.
- Prefer simple, low-coupling designs with clear inputs and outputs over types that reach into shared mutable state.
