---
name: search-before-write
description: Prove what already exists before writing or editing code
injection: always
---

Before writing new code or editing existing code, establish what already exists. Never claim functionality is missing, duplicated, or absent without evidence.

1. **Search first.** Grep/find for the symbol, function, type, or concept you're about to introduce. Read the call sites and adjacent tests.
2. **Locate the right surface.** Identify the specific file(s) and symbols that should change, and why. Prefer extending existing code over creating parallel implementations.
3. **Flag prior art.** If a partial, placeholder, or TODO implementation already exists, surface it and build on it rather than duplicating.

This is a discipline gate, not a loop step — it applies to every implementation turn, whether or not an autonomous workflow is driving. Skipping it produces duplicate logic, conflicting implementations, and changes in the wrong layer.
