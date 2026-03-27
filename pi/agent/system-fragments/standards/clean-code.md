Favor clear, maintainable code from the first pass.

- Read requirements and tests carefully before changing behavior.
- Challenge assumptions and fix root causes instead of adding test/workflow workarounds.
- Prefer simple, low-coupling designs with straightforward inputs/outputs.
- Extract complex nested logic early into small, descriptive helpers.
- Use language/framework idioms instead of custom reinventions when equivalents exist.
- Keep comments minimal and high-signal; let naming and structure carry intent.
- Treat tests as specification feedback: when they fail, verify expected behavior before changing tests.
- During refactors, preserve behavior while improving clarity, boundaries, and readability.