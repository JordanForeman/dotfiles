---
name: comments
description: Authoring or editing code where the question arises of whether prose earns its place — inline comments, file/class headers, TODOs
injection: always
---

Comment the *why*, name the *what*. Prose in code is the carrier of last resort: it exists for intent the code genuinely cannot carry itself. As an AI author, your default disposition is *less* prose, not more — well-intentioned verbosity is still noise.

### A *what*-comment is a naming failure

- A comment that restates what a line or block does is a smell. The code already says it, and the comment will rot, drift, and eventually lie.
- When you feel the urge to explain *what* a statement does, that urge is a signal to **improve a name or extract a named concept** — not to add the comment.
  - `orders.select { |o| o.paid? && !o.fulfilled? } # only paid, unfulfilled orders` → extract `orders.select(&:fulfillable?)`.
- The fix for unclear code is clearer code, not a caption.

### The *why* earns its place

A comment is an asset when it carries non-obvious context the code cannot express:

- A workaround for an upstream bug or a deliberate deviation from the obvious approach.
- A business rule whose rationale isn't derivable from the code.
- A load-bearing line that looks wrong but is correct ("this looks redundant but...").

### Headers: design intent, never inventory

A plain-English overview at the top of a file/module/class is the one place a higher-level *what* is legitimate — but only when it carries **design intent and constraints** a reader couldn't reconstruct from the members: idempotency, ordering requirements, replay-safety, the file's role in the broader system.

- Earns its place: *"Reconciliation runs nightly and is intentionally idempotent — every write must be safe to replay; ledger before notifications."*
- Rot: a comment that inventories the methods the class already shows.
- **Tolerated, not encouraged.** Value a good header when a human wrote it; never generate one on your own initiative. An "overview" produced by an AI by default is noise.

### TODOs link to a tracker, or they're noise

- A bare `# TODO` is a wish. If it's real debt, it links to an external tracker (Jira, GitHub issue) with a referent.
- These should be rare. Code is cheap to produce and revise now; the marker is rarely the right tool.

### Most "technical debt" is product debt

When code feels like it needs a cleanup-comment or a TODO, the real question is almost always: *have we modeled this correctly?* "Technical debt" is usually a misnomer — the honest framing is **product/modeling debt**: things we can't model correctly *yet* because the product hasn't discovered how it *should* be modeled.

- The response to that ambiguity is to **preserve optionality**, not to annotate the gap and move on.
- This is the same instinct as interrogating the model before choosing a return shape (see `error-signaling`): the apparent code problem is usually a modeling problem wearing a disguise.
