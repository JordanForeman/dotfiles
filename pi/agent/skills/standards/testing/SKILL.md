---
name: testing
description: Writing, reviewing, or restructuring tests where what makes a test *good* (not just present) is in question
injection: classify
detect:
  files: [jest.config.js, jest.config.ts, vitest.config.ts, vitest.config.js, .rspec, pytest.ini, go.mod]
---

`test-first` (a convention) governs *when* tests are written — before the code. This skill governs *what good looks like* once you're writing them. A passing test is not automatically a good test.

### Assert on observable behavior, not implementation

- Test real state and observable side effects, not the internal calls that produced them.
- Prefer behavioral assertions (`resolved_quantity == 3`, `status == :declined`) over mock-expectation assertions (`expect(Service).to receive(:call).with(...)`). Mock-expectation tests pin the test to *how* the code works and break on harmless refactors while passing on real regressions.
- Reserve mocks for true boundaries (network, clock, external services) — not for collaborators you own and could exercise directly.

### One reason to fail

- A test should fail for exactly one reason. When a test can fail for several unrelated causes, a failure tells you little about what broke.
- Make arrange / act / assert legible — setup, the single action under test, then the assertions. A reader should see what's being specified at a glance.

### Tests specify behavior; they are not the spec's enemy

- Treat tests as specification feedback. When a test fails, verify the *expected behavior* before changing the test.
- Don't modify an existing test to make new code pass unless the test was genuinely wrong. Don't write a test that merely restates the implementation.

### Don't distort the design to enable testing

- If a unit is hard to test, that's usually a design signal, not a reason to widen the public surface. Restructure so the thing you want to verify is reachable through a legitimate seam — never expose internals solely for a test.
