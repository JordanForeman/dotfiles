---
name: module-structure
description: Creating, splitting, or reorganizing files and directories where the file tree communicates system boundaries
injection: classify
---

The file tree is the first thing a reader encounters. It should communicate system boundaries and responsibilities before any code is opened. This taste applies when you're *creating or restructuring files* — not on routine edits within an existing layout.

### Each file has one obvious reason to exist

- A file or module should have a single, nameable responsibility — describable in a short phrase.
- When a file grows to serve multiple concerns, split along responsibility boundaries. The new files' names should make the split self-explanatory.

### Structure mirrors the domain, not the implementation

- Directory structure should mirror domain concepts or architectural layers (`payments/`, `notifications/`), not implementation artifacts (`helpers/`, `utils/`, `managers/`).
- A tree organized by *what things are about* lets a reader navigate by intent; a tree organized by *what kind of code* it is forces them to already know where things live.

### Splits should reduce, not relocate, complexity

- Extract a new file when it carves out a coherent responsibility — not merely to shorten a long file.
- After a split, each resulting file should be independently nameable and explainable. If you can't name the new file without "and", the boundary is wrong.

### Namespacing: defer to the project, then earn depth

- **Consistency above all.** Match the project's existing namespacing convention even when it diverges from personal preference. A predictable codebase is worth more than an individually "better" structure; maintainability comes from uniformity, not local optimization.
- **Depth must earn its keep.** Each level of nesting is a claim that a meaningful boundary exists there. Don't introduce a namespace level to file things away — introduce it when it names a real distinction a reader benefits from.
- **Fully-qualified names should read as a sentence.** A reader encountering `Domain::Subdomain::Responsibility` should be able to narrate what it is from the path alone. If the qualified name reads as noise, the hierarchy is wrong.
- **Top levels mirror the business domain; deeper levels may mirror technical responsibility.** The outermost namespace should name *what part of the business* this is (e.g. `Payments`, `Orders`). As you descend, levels can shift to naming *technical role* (e.g. `Payments::Refunds::Calculator`). Pluralize and add a level when a single responsibility grows into a family (`Payments::Refunds::Calculators::RemainingBalance`).
- The result is a pragmatic blend: domain hierarchy at the top, technical structure below, every level justified, the whole reading as a coherent phrase.
