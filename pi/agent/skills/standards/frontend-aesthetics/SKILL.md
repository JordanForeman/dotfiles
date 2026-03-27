---
name: frontend-aesthetics
description: Frontend design and aesthetics guidance for UI/visual work
injection: detect
detect:
  files: [tailwind.config.ts, tailwind.config.js, postcss.config.js, vite.config.ts, vite.config.js, next.config.ts, next.config.js, next.config.mjs, nuxt.config.ts, astro.config.ts, astro.config.mjs]
  dependencies: [react, next, vue, nuxt, svelte, "@sveltejs/kit", solid-js, astro, "@angular/core", preact]
---

- Default away from generic, on-distribution UI output; pursue context-specific visual direction with intentional creative choices.
- Treat frontend aesthetics as a first-class implementation concern (not polish to defer).
- Typography:
  - Choose expressive, context-appropriate type pairings.
  - Avoid overused defaults (e.g., Arial, Inter, Roboto, generic system stacks) unless explicitly requested.
  - Explain your font rationale when introducing a new visual system.
- Color and theme:
  - Commit to a coherent visual identity with clear dominant tones and sharp accents.
  - Use CSS variables/tokens for palette consistency and themeability.
  - Prefer opinionated palettes over timid evenly distributed color usage.
  - Draw inspiration from proven aesthetics (e.g., IDE palettes, editorial design, cultural motifs) when appropriate.
- Motion:
  - Use motion intentionally for high-impact moments (especially initial load and section reveals).
  - Prefer CSS-first animation solutions in HTML/CSS contexts.
  - In React, use Motion library conventions when available in the project.
  - Prioritize a few well-choreographed transitions over many low-value micro-animations.
- Backgrounds and depth:
  - Build atmosphere with layered gradients, subtle texture/pattern, lighting, or contextual effects.
  - Avoid flat default backgrounds when stronger visual depth supports the product tone.
- Avoid AI-generic aesthetics:
  - No cookie-cutter layouts/components without context-specific adaptation.
  - Avoid clichéd palette defaults (especially purple-on-white gradient tropes) unless context explicitly calls for them.
  - Vary visual language across projects; do not repeatedly converge on the same familiar combinations.
- Maintain usability and accessibility while being distinctive: ensure contrast, readability, focus visibility, and reduced-motion support.
