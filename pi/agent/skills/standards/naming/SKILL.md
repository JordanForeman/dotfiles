---
name: naming
description: Authoring or editing code where names (variables, methods, classes, files) carry the design intent
injection: always
---

Names are the primary carrier of intent. A reader should understand *what* code does and *why* from names alone — without parsing implementation or leaning on comments. This is the always-on floor of code taste: every identifier you write is a naming decision.

### Names describe what, not how

- Method names describe the accomplishment, not the mechanism: `ensureAuthenticated()` over `checkTokenAndRefreshIfExpiredOrThrow()`.
- Variable and type names state the concept, not its representation: `pendingOrders`, not `orderArray2`.
- If you can't name something clearly, you probably don't understand its responsibility yet. Clarify the design before committing to a name.

### Use domain language, consistently

- If the business calls it an "enrollment", don't call it a "registration" in code.
- Pick one term per concept and use it everywhere — names that drift (`user` / `account` / `member` for the same thing) force the reader to constantly re-map.

### Let naming mismatches surface design problems

- When a method's name doesn't match what it actually does, fix the *design* — don't just rename to paper over it.
- A name that needs a qualifying comment to be understood is a name that hasn't earned its place.

### Names make comments unnecessary

- Well-named, well-structured code rarely needs comments. Keep comments minimal and high-signal: reserve them for *why*, not *what*.
- If you feel the urge to write a comment explaining what a block does, that block usually wants to be a named method instead.
