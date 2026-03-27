---
name: python
description: Python project guidance
injection: detect
detect:
  files: [pyproject.toml, setup.py, setup.cfg, requirements.txt, Pipfile, poetry.lock, .python-version]
---

- Follow PEP 8 conventions and existing project style.
- Prefer explicit imports over wildcard imports.
- Use type hints at function boundaries; avoid excessive internal annotations.
- Keep compatibility with the project's minimum Python version.
- Prefer standard library solutions over third-party packages when feasible.
