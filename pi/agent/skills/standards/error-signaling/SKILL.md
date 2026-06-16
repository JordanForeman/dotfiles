---
name: error-signaling
description: Writing code that can fail — choosing how a failure is signaled (return value vs. raised exception) based on where in the architecture the code sits
injection: classify
---

How a failure is signaled is a design decision, not a reflex. The mechanism — return a value or raise an exception — is determined by *where the code sits relative to a boundary*, and by whether the failure is **expected** or **exceptional**.

### Interrogate the model first

Before choosing *how* to signal a failure, ask whether the method is being forced to conflate two concerns. A method that wants to return **two categorically different shapes** (a number *or* a status, a record *or* an error) is almost always a modeling failure, not a signaling problem. Most "do I return a union / a result object / raise?" dilemmas dissolve once the model is corrected so each method answers one coherent question and returns one coherent type.

Example: if `remaining_balance` is tempted to return an `Integer` *or* `:pending`, the real defect is upstream — *whether the balance is computable yet* is a different concern from *what the balance is*. Model the asynchronous/pending state separately, higher up, and let `remaining_balance` go back to always returning a money value. Fix the model, not the return type.

### Choosing the return shape (preference order)

For an expected outcome, in descending preference:

1. **A bare domain type or primitive that already encodes every valid outcome.** A fully-refunded order's remaining balance is `0`, not a wrapped failure. "No overdue invoices" is `[]`. A lifecycle state is an enum. If the return type can carry the outcome as an ordinary value, return it — no wrapper, no ceremony.
   ```rb
   def remaining_balance
     return 0 if fully_refunded?   # an honest, in-domain answer — not a failure
     compute
   end
   ```
2. **`nil` for honest absence.** When a lookup legitimately finds nothing, return `nil` — it is the truthful "there is nothing here" (think JavaScript's `undefined`, not a materialized `null`). The caller should consciously decide what absence means.
3. **A null object only when affirmatively justified** — i.e. when a no-op is *genuinely the correct domain behavior*, not merely a way to dodge a `nil` check. The bar is high: a null object that silently no-ops can swallow a real bug (the caller believes it charged something; nothing happened). Default to `nil`; reach for a null object as the rare exception.
4. **A result-object wrapper only in the genuine niche** where structured failure *data* must travel (an error reason, a retry hint, a payload that differs by branch) and no domain value can carry it. Don't reach for a `Result` to wrap a value the domain type already expresses.
5. **Almost never a bare union of two distinct types.** An API that returns one of two totally distinct types is a strong smell — treat the urge to write one as a signal to return to *Interrogate the model first*.

Collections are their own case: return an empty collection (`[]`) for "no matching elements," never `nil` — an empty result *is* the honest, fully-typed answer and lets callers iterate without guarding. "No such parent record" is a different concern, caught upstream at the lookup boundary, not collapsed into the collection method.

### Exceptions are exceptional

- Internally, **exceptions are never control flow.** If a failure mode is expected — a record not found, a validation that didn't pass, a precondition the caller can reasonably hit — model it with ordinary control flow: a return value, a `nil`/`false`, or a result object. Reserve raising for genuinely unexpected states: bugs, invariant violations, corrupted assumptions.
- A good test: *would a careful caller be surprised this happened?* If no, it's an expected path — return it. If yes, it's exceptional — raise it. `find_by` over `find_by!` when "missing" is a normal outcome the caller will handle.

### Boundaries raise; interiors return

A **boundary** is anywhere conceptual ownership changes hands:

- frontend → backend (API controllers, GraphQL resolvers, RPC handlers)
- one business domain / component → another
- synchronous flow → background job

The signaling rule follows the topology:

- **Core / leaf logic** (the interior) uses **return values or result objects** for expected failures. It does not raise to communicate a normal outcome upward.
- **Service / orchestration layer** may use **domain-specific exceptions** to signal failures the caller is expected to handle or the boundary is expected to translate. These are part of that layer's contract, not ad-hoc escapes.
- **Boundaries** are where expected failures get translated into **clearly articulated, external-facing errors** — a GraphQL error, an HTTP status, a typed API error. The interior arrives at the boundary carrying a result; the boundary turns it into the contract the outside world sees. Normalize framework-specific exceptions (e.g. an ORM's `RecordInvalid`) into consistent domain-level errors at this seam.

### Failure isolation for secondary work

- Secondary or bookkeeping logic — reconciliation, indexing, notifications, background side effects — must not be able to roll back or block the primary operation. Wrap it so its failure is isolated (an independent `rescue`, a `rescue_from_error` pattern) and the primary transaction stands.
- In batch or maintenance tasks, isolate per-item so one failure doesn't halt the batch. Prefer forward progress.

### Make failures observable, not loud

- Expected failures in high-volume paths should be observable without paging anyone: a counter, a granular event. Prefer specific event/metric names (`reconcile.order_not_found`) over generic ones (`task_failure`) so failures are searchable and isolable.
