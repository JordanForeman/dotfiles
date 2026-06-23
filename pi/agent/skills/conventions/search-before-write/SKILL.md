---
name: search-before-write
description: Prove what already exists before writing or editing code
injection: always
---

Before writing new code or editing existing code, establish what already exists. Never claim functionality is missing, duplicated, or absent without evidence.

1. **Search first.** Grep/find for the symbol, function, type, or concept you're about to introduce. Read the call sites and adjacent tests.
2. **Locate the right surface.** Identify the specific file(s) and symbols that should change, and why. Prefer extending existing code over creating parallel implementations.
3. **Flag prior art.** If a partial, placeholder, or TODO implementation already exists, surface it and build on it rather than duplicating.
4. **Trust live state over memory.** When remembered context, a draft plan, or previous-session notes disagree with the current checkout, treat the live code, diff, tests, and tool output as authoritative. If the work is already implemented, shift to validation and closeout instead of reimplementing it.

This is a discipline gate, not a loop step — it applies to every implementation turn, whether or not an autonomous workflow is driving. Skipping it produces duplicate logic, conflicting implementations, and changes in the wrong layer.
