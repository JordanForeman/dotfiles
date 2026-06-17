---
name: testing
description: Writing, reviewing, or restructuring tests where what makes a test *good* (not just present) is in question
injection: classify
detect:
  files: [jest.config.js, jest.config.ts, vitest.config.ts, vitest.config.js, .rspec, pytest.ini, go.mod]
---

`test-first` (a convention) governs *when* tests are written — before the code. This skill governs *what good looks like* once you're writing them. A passing test is not automatically a good test.

### Structure: Given / When / Then, one scenario per test

A good test reads like a Gherkin scenario:

- **Given** — arrange the world: the data/state this one scenario requires.
- **When** — typically a single line: invoke the unit, inject the world.
- **Then** — assert what should happen.

Use **as many assertions as the single coherent scenario warrants** — multiple assertions fully describing one outcome is good, not a smell. The smell is smuggling a *second scenario* into the same block. One scenario per test; assertion count is not the metric.

### Isolation tracks test *scope*, not runtime topology

Test boundaries are about scope and the cost of knowledge — distinct from error-signaling's runtime ownership boundaries. Match isolation to the layer:

- **E2E** — by definition, *no* boundaries. Exercise the real path end to end; don't mock.
- **Integration** — the test is *explicitly about* the boundaries: what they are and how data flows across a larger-than-unit subset (e.g. module → module). The boundaries are the subject, not something to stub away. An integration test may legitimately *assert* a side effect (a job was enqueued).
- **Unit** — default to **no mocking**; lean on real collaborator behavior.

### Unit mocking: the "hands in the clay" threshold

Default to real collaborators. The signal to reach for a mock is felt while writing the test, not drawn on a diagram first:

- **Mock when setup starts speaking the collaborator's language.** As long as the *arrange* step describes the unit's own world, stay real. The moment setup must encode how data states interact *inside* a collaborator — the collaborator's internals have leaked into the test — mock that collaborator and test the unit's own logic.
- Asserting on collaborator messaging is a **mild** smell — a pragmatic release valve when real collaboration would force the test to know too much, not a forbidden act.
- **Side-effect prevention is usually systemic, not per-test.** If a side effect must be suppressed (job enqueuing, external writes), solve it once at the harness level (suppress the whole job system) — don't re-litigate it in every test's setup. An individual test carrying that burden is the smell.
- **If you must mock, the double must be faithful to the real contract.** Use a verifying double (`instance_double`) over a loose stub: an unverified double lets the real signature drift while the test stays green, manufacturing false confidence — worse than no test, because it lies.

> Don't over-index on ActiveRecord. "Real AR in tests" is a pragmatic consequence of Rails' unusually tight ORM coupling, not a general principle. In non-Rails contexts it's a footnote, not the axis of the mocking strategy.

### Assert on observable behavior, not implementation

- Test real state and observable side effects, not the internal calls that produced them.
- Prefer behavioral assertions (`resolved_quantity == 3`, `status == :declined`) over mock-expectation assertions (`expect(Service).to receive(:call).with(...)`). Mock-expectation tests pin the test to *how* the code works and break on harmless refactors while passing on real regressions.

### One reason to fail

- A test should fail for exactly one reason. When a test can fail for several unrelated causes, a failure tells you little about what broke.

### Tests specify behavior; they are not the spec's enemy

- Treat tests as specification feedback. When a test fails, verify the *expected behavior* before changing the test.
- Don't modify an existing test to make new code pass unless the test was genuinely wrong. Don't write a test that merely restates the implementation.

### Don't distort the design to enable testing

- If a unit is hard to test, that's usually a design signal, not a reason to widen the public surface. Restructure so the thing you want to verify is reachable through a legitimate seam — never expose internals solely for a test.
