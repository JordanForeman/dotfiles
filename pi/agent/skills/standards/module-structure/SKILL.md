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
