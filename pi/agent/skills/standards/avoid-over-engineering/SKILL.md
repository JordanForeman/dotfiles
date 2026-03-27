---
name: avoid-over-engineering
description: User wants a focused, minimal change — a bug fix, small feature, or targeted edit without scope creep
injection: classify
---

- Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
- Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability.
- Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
- Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements.
- Three similar lines of code is better than a premature abstraction.
