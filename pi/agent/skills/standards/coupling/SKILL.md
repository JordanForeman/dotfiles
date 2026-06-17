---
name: coupling
description: Deciding how a unit acquires its collaborators and dependencies — what a signature should express versus what should be wired structurally or behind an owned seam
injection: classify
---

How a unit gets its collaborators is a design decision, not an implementation detail. The shape of that decision determines whether an interface reads as intent or as plumbing. This taste applies when you're *deciding how a dependency is acquired* — designing a constructor, a method signature, or the wiring between components.

### Answer "whose decision is it?" before writing the classes

- For each choice a unit makes (which gateway, which strategy, which collaborator), decide *who owns that decision* — the unit itself, or its caller — **before** writing the code. The answer is structural and durable; it seldom changes.
- The ownership answer dictates the shape. If the unit owns the choice, the dependency stays ambient or structural and the signature stays clean. If the caller genuinely owns the choice, the dependency earns a place in the signature because it's now part of what the API legitimately expresses.
- Getting this right early is cheap. Getting it wrong produces a signature that lies about who is responsible — and that's expensive to unwind later. This is the same reflex as interrogating the model first (see `error-signaling`): answer the ownership question before the code shape, because the shape is just the honest expression of the answer.

### A signature expresses what a thing is and does — not what it depends on

- An API — a class, a method name plus its params — is an expression of *what the thing is, what it does, and with what it does it*. It is not obligated to advertise its wiring.
- Prefer the clean interface. `refund.issue` reads as intent; `refund.issue(gateway:)` leaks a wiring concern into a signature that should read as purpose. When the unit owns the dependency, keep it off the signature.
- Be skeptical of dependency injection *as an interface choice*. Threading a dependency through a signature to buy flexibility you don't yet need is speculative abstraction. The awkward middle — DI smeared across every signature — taxes the interface without the clarity of a real structural pattern.

### Absorb real, present variation with structure, not injection points

- When there is genuinely more than one implementation *today*, reach for a structural response chosen at the system level — strategy, proxy, factory, delegator — rather than an injected parameter on every caller. The unit consults the structure; its signature stays clean.
- The strategy pattern is the preferred tool for absorbing variation the unit owns. Model the variation as a first-class structural thing, not as a per-call burden.
- Anticipated variation is not present variation. One implementation → let the dependency be ambient. Don't introduce a port/role/strategy for a future that hasn't arrived.

### Depend toward what you own; wrap what you don't

- When a unit needs a concern from an outer layer or another component, don't reach sideways into that component's internals, and don't scatter naive calls to its public API everywhere.
- Own a level of indirection — a proxy or adapter you control that speaks *your* domain's language. Depend on that owned seam, not on the foreign surface directly.
- Treat the owned seam as a standing prompt to re-check ownership: is this concept really the other component's, or has it become yours? When it's genuinely yours, grow your own and repay the borrowed dependency. A borrowed concept behind a proxy is a deliberate, temporary seam — not a permanent coupling.

### Never inject solely for testability

- Do not thread a dependency into a signature only to make a unit testable. That conflates the public contract with test-only needs — the same erosion of cohesion as widening public surface to test (see `api-design`).
- If a unit is hard to test without injecting its collaborators, that's a signal to reconsider the design or the test's scope (see `testing` on the "hands in the clay" mocking threshold), not to inject. Accept signature-level injection for testability only in genuinely extreme, niche cases.
