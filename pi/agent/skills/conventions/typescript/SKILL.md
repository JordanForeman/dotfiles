---
name: typescript
description: TypeScript/Node project guidance
injection: detect
detect:
  files: [package.json, tsconfig.json]
---

- Preserve the repository's TypeScript style and tsconfig assumptions.
- Prefer narrow, explicit types at boundaries and avoid broad `any` usage.
- Keep runtime behavior changes paired with relevant tests or validation commands.
- Avoid large type-system refactors unless they are directly required.
