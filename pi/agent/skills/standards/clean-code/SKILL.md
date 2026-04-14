---
name: clean-code
description: Task involves implementation or refactoring where code quality, clarity, and maintainability standards should be reinforced
injection: classify
---

Well-authored code tells a story. A reader should understand *what* the code does and *why* from names and structure alone — without parsing implementation details or relying on comments to fill gaps. This principle applies at every level, from directory layout down to individual expressions.

### Module and file level

The file tree is the first thing a reader encounters. It should communicate system boundaries and responsibilities before any code is opened.

- Each file or module should have a single, obvious reason to exist — nameable in a short phrase.
- Directory structure should mirror domain concepts or architectural layers, not mirror implementation artifacts (e.g. `payments/`, `notifications/`, not `helpers/`, `utils/`, `managers/`).
- When a file grows to serve multiple concerns, split along responsibility boundaries. The new files' names should make the split self-explanatory.

### Class and type level

Classes are nouns with design intention. A well-designed class has a clear role that its name communicates.

- Name classes after what they *are* or what role they *play*: `RetryPolicy`, `OrderSerializer`, `PaymentGateway`. Avoid generic suffixes like `Service`, `Manager`, `Handler` unless the class genuinely has no narrower role.
- Apply design vocabulary when it fits naturally — facades, adapters, factories, policies, builders. These names carry semantic weight: they tell the reader *how* the class participates in the system, not just *that* it exists.
- A class should have both public and private surface area. The public API is the narrative — what this object does for its collaborators. The private API is the vocabulary — named pieces of internal logic that the public methods compose.
- A class with no private methods likely hasn't been designed; it just grew. A class where every method is public likely has no encapsulation boundary.
- Prefer many small, focused classes over few large ones. When a class accumulates unrelated responsibilities, extract a collaborator.

### Method level

Methods are sentences. Each method should operate at one consistent level of abstraction.

- A public method's body should read as a sequence of named steps: `validateInput()`, `buildResponse()`, `notifySubscribers()`. A reader should grasp the flow without drilling into any single step.
- When a method mixes abstraction levels — HTTP setup next to business rules next to error formatting — extract the lower-level details into named private methods. The method body stays at its natural level.
- Method names should describe *what* the method accomplishes, not *how*: `ensureAuthenticated()` over `checkTokenAndRefreshIfExpiredOrThrow()`.
- Keep methods short enough that they don't need sectional comments. If you feel the urge to write `// Step 3: validate permissions`, that's a signal to extract `validatePermissions()`.
- Avoid boolean parameters that silently toggle behavior. Prefer separate methods with intention-revealing names, or a small options/config type when multiple knobs are genuinely needed.

### Naming as design tool

Names are the primary carrier of intent. Invest in them.

- If you can't name something clearly, you probably don't understand its responsibility yet. Clarify the design before committing to a name.
- Use domain language consistently. If the business calls it an "enrollment", don't call it a "registration" in code.
- Let naming mismatches surface design problems. When a method name doesn't match what it actually does, fix the design — don't just fix the name.

### Complementary principles

- Read requirements and tests carefully before changing behavior.
- Challenge assumptions and fix root causes instead of adding workarounds.
- Prefer simple, low-coupling designs with straightforward inputs/outputs. Design vocabulary should clarify, not add ceremony.
- Use language/framework idioms instead of custom reinventions when equivalents exist.
- Keep comments minimal and high-signal; well-structured, well-named code should rarely need them.
- Treat tests as specification feedback: when they fail, verify expected behavior before changing tests.
- During refactors, preserve behavior while improving clarity, boundaries, and readability.
