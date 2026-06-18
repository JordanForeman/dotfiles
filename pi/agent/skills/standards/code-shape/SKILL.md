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
- Avoid one-use derived locals that only feed the next conditional or assignment. Put the transformation in the closest block instead, unless the local names a domain concept, avoids expensive duplication, or preserves a meaningful semantic distinction.
- Use language/framework idioms instead of custom reinventions when an equivalent exists.

### Shape is taste; idiom is the language's call

The rules below express a constant taste — *one method, one coherent intent, legible at the call site* — but how that taste is realized is the host language's decision, never a universal imposed against the grain. Hold the principle; apply it idiomatically. This is `module-structure`'s "defer to convention" pushed down to the altitude of language idiom.

### Parameters: legible at the call site, through the language's grain

- Optimize for a call site that reads clearly. In Ruby that means keyword arguments by default; in another language it may mean an options object, struct, or builder. The taste ("the call should read as a sentence") travels; the mechanism doesn't.
- When the argument list itself becomes a recurring *thing* passed around together, the args have become a concept — extract a parameter object. This is the same "interrogate the model first" tell from `error-signaling`: a growing positional/keyword list is usually a missing abstraction.

### One coherent question per method — expressed idiomatically

- A method answers one coherent question and returns one coherent thing. In Ruby, `value, error = thing.do` is a smell — a method answering two questions, a bare union in tuple clothing; return the concept, or split the method.
- This is **not** a blanket prohibition on multi-return. In languages where tuple returns are idiomatic (e.g. Rust), a tuple can *be* the one coherent answer. Don't fight the grain in unfamiliar territory where multi-return is correct.

### Command/query separation — strong default, enforced by the name

- CQS is a strong default: a verb commands (`issue`, `activate`), a getter queries (`fulfillable_items`). The contract is carried by the **name**.
- The hard smell is a conjunctive name that betrays a split responsibility: `do_x_and_return_y`. A name that promises one thing and does two is two methods wearing one name.
- A creator returning the object it just made (`refunds.issue` → the `Refund`) is *tolerated, not preferred*: pragmatic but slightly obtuse, since `issue` is a verb and should issue. Don't block a review over it; don't default to it either.
