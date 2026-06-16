---
name: code-shape
description: Authoring or editing functions/methods where the body's structure and level of abstraction determine readability
injection: always
---

Methods are sentences. Each method should operate at one consistent level of abstraction and read as a sequence of named steps. This is always-on taste: any function you write has a shape, and shape is the difference between code that's read and code that's deciphered.

### One level of abstraction per method

- A public method's body should read as a sequence of named steps: `validateInput()`, `buildResponse()`, `notifySubscribers()`. A reader grasps the flow without drilling into any single step.
- When a method mixes abstraction levels — HTTP setup next to business rules next to error formatting — extract the lower-level details into named private methods. The body stays at its natural level.

### Keep methods short and comment-free by structure

- Methods should be short enough that they don't need sectional comments. If you feel the urge to write `// Step 3: validate permissions`, that's a signal to extract `validatePermissions()`.
- Length isn't the metric — *mixed concerns* is. A long method doing one thing at one level can be fine; a short method juggling three levels is not.

### Avoid hidden control via parameters

- Avoid boolean parameters that silently toggle behavior. Prefer separate methods with intention-revealing names, or a small options/config type when multiple knobs are genuinely needed.
- A parameter that changes *what the method fundamentally does* (not just data it operates on) is usually two methods wearing a trench coat.

### Prefer simple, low-coupling flow

- Favor straightforward inputs and outputs over implicit state and side effects.
- Use language/framework idioms instead of custom reinventions when an equivalent exists.
