---
name: dream
description: "End-of-day learning synthesis. Analyzes Pi session transcripts created since the last run, extracts durable engineering learnings, launders them through the discretion gate, diffs them against existing codified skills, and opens (or amends) a single reviewable PR against the dotfiles repo. Idempotent and cross-machine via a committed watermark. Invoke after /skill:daily-debrief."
injection: explicit
---

# Dream

You are running Jordan's nightly **learning synthesis** — the "dream" process.
You read the conversations Jordan has had with Pi since the last dream, extract
what is worth *codifying* into his skills/prompts, generalize it so it is safe
for a public repo, and propose it as **one PR he reviews**. You never edit `main`
directly, and you never commit raw work specifics.

This is the human-triggered counterpart to `/skill:daily-brief` and
`/skill:daily-debrief`. Run it after the debrief.

## Invariants (do not violate)

- **Propose-only.** All changes land on a branch and a PR. Never commit to `main`.
- **Discretion is mandatory.** Every candidate learning passes through the
  `discretion` skill's generalization gate before it can be written. Load it.
- **Idempotent.** Re-running with no new sessions produces no PR and no churn.
- **Cross-machine.** State lives in the repo at `pi/agent/.dream-state.json`,
  not in machine-local files. Advancing the cursor happens *in the PR*.
- **Bounded per run.** Never process more than `MAX_SESSIONS_PER_RUN = 40`
  transcripts in a single run. The corpus is hundreds of multi-MB sessions; an
  unbounded first run would spawn hundreds of subagents. The two-pointer
  watermark (below) makes capping safe — the next run continues where this one
  stopped, and nothing is ever stranded.
- **Context isolation.** Sessions are routinely 10–15 MB. NEVER read a
  transcript into this (the orchestrator's) context. Each transcript is ingested
  by a `dream-ingestor` subagent in its own context; you only ever see the
  distilled candidate learnings it returns.
- **Deterministic git.** You decide *what* to learn; let plain git/`gh` commands
  do branch/commit/PR. Delegate git operations to the `git-ops` subagent.

## Locations

- **Dotfiles repo**: `~/.dotfiles` (symlink → the checkout). All edits + the
  watermark + the PR happen here. `cd` here first.
- **Session transcripts**: `~/.pi/agent/sessions/**/*.jsonl` and
  `~/.pi/agent-shopify/sessions/**/*.jsonl`.
- **Watermark**: `pi/agent/.dream-state.json` (per-profile cursor map).
- **Codified knowledge** (the edit targets): `pi/agent/skills/{conventions,guides,formats,standards}/*/SKILL.md`.

## Transcript format (what you parse)

Each session is a JSONL file. The **first line** is
`{"type":"session","id":"<uuid>","timestamp":"<iso8601>","cwd":...}`. The
filename is `<iso8601-timestamp>_<uuid>.jsonl` (the timestamp uses `-` instead of
`:` so it is filesystem-safe). Subsequent lines include
`{"type":"message","message":{"role":...,"content":[{"type":"text","text":...}]}}`.

**Sort by the `timestamp`, never the `id`.** Older sessions use random UUID4 ids
(e.g. `79102b89-…`); newer ones use UUID7. Only UUID7 is time-sortable, so sorting
by `id` lets a high-lexical legacy UUID4 (e.g. `fe51…` from February) poison the
cursor and permanently exclude every later UUID7 session (`019…`). The header
`timestamp` field (and the equivalent filename prefix) is ISO8601 — lexicographically
chronological across **both** id formats. Use it.

**Only process top-level session files.** Skip nested subagent runs — any path
containing `/run-0/session.jsonl` or an intermediate hash dir is a subagent
transcript, not a conversation. Match only `sessions/<cwd-slug>/<timestamp>_<uuid>.jsonl`.
Also skip the currently running /dream session if it appears in the work set;
active transcripts are still being written and can create self-referential
learnings. Let the next run process that file once it is complete.

## Phase 0 — Memory-first recall

Use `swarmy_think` to recall: prior dream runs, recently codified skills, and any
open dream PR. You want to avoid re-proposing things already learned.

## Phase 1 — Determine the work set (two-pointer, capped)

Each profile's state is `{ "cursor": <iso8601>, "floor": <iso8601> }`:

- **`cursor`** = highest timestamp already processed (the *new* edge).
- **`floor`** = lowest timestamp processed contiguously (the *old* edge).

The cap is `MAX_SESSIONS_PER_RUN = 40` (total across both profiles).

1. `cd ~/.dotfiles` and read `pi/agent/.dream-state.json`. (If you find the
   legacy v1 shape where a cursor is a bare string, treat that string as
   `cursor` and an empty `floor`.)
2. Enumerate top-level transcripts for both profiles, sorted by `timestamp`
   (newest first). For each profile, classify each session:
   - **forward** — `timestamp` strictly **greater than** `cursor` (new since
     last run). These are the priority.
   - **backfill** — `timestamp` strictly **less than** `floor` (older history not
     yet swept). Only relevant once forward work is exhausted.
3. Build the capped work set, newest-first, **forward before backfill**:
   take forward sessions (newest first) up to the cap; if room remains, fill
   with backfill sessions (newest first). **First run** (empty `cursor` *and*
   empty `floor`): every session is "forward," so you simply take the newest N.
4. If the work set is empty across both profiles: report "nothing new to dream"
   and **stop** (no branch, no PR). This is the idempotency guarantee.
5. If sessions remain beyond the cap, note the **pending count** per profile —
   you will surface it in the output so Jordan knows to re-run.

Why two pointers: "newest-first" means a single max-timestamp cursor would strand
all older history below it forever. Tracking both edges lets forward runs grab
new sessions immediately *and* lets backfill runs drain the old backlog over
subsequent nights — nothing is ever permanently excluded.

A reference enumerator (read-only; print profile, timestamp, id, path — sorted
newest-first). It keys on the header `timestamp`, **not** the `id`:

```bash
for prof in agent agent-shopify; do
  find "$HOME/.pi/$prof/sessions" -type f -name '*.jsonl' \
    ! -path '*/run-*/*' 2>/dev/null | while read -r f; do
      read -r ts id < <(head -1 "$f" | python3 -c \
        'import sys,json;h=json.load(sys.stdin);print(h.get("timestamp",""),h.get("id",""))' 2>/dev/null)
      [ -n "$ts" ] && printf '%s\t%s\t%s\t%s\n' "$prof" "$ts" "$id" "$f"
  done
done | sort -t$'\t' -k2 -r
```

## Phase 2 — Ingest transcripts via subagents (map step)

**Do not read transcripts yourself.** Sessions are 10–15 MB; reading one inline
would blow this context. Instead, for **each** session in the work set, delegate
to the `dream-ingestor` subagent, passing the absolute transcript path:

```
subagent { agent: "dream-ingestor", task: "Ingest this Pi session transcript and return distilled candidate learnings: <ABSOLUTE_PATH>" }
```

Fan these out in parallel where the harness allows (independent inputs), but
respect the harness's batch limits. If the map is larger than the allowed fanout
or a wave times out, chunk the work into smaller waves, keep completed
`DREAM_INGEST` blocks, and retry only the missing transcripts. Each subagent
reads its one transcript in an isolated context and returns only a small
`DREAM_INGEST` block (≤~400 tokens) of candidate learnings. You collect those
blocks — never the raw transcripts.

Then **reduce**: synthesize across all returned candidate blocks. This is where
cross-session signal emerges (the same correction or preference surfacing in
multiple `DREAM_INGEST` outputs). A candidate qualifies for the next phase only
if at least one holds:

- Jordan **explicitly corrected** the agent (preference or fact).
- Jordan expressed a **durable preference** about how work should be done.
- A pattern **recurred ≥2 times** across sessions (cross-session signal — the
  thing a per-session hook could never see).
- A **reusable technique** emerged that generalizes beyond its origin.

Reject: one-off task mechanics, project status, things already in a skill
(check Phase 0 recall + read the candidate's target skill). Optimize this pass
for *fidelity* — capture the real insight. Discretion comes next.

If the ingestor subagent is unavailable, fall back to a bounded extraction (text
only, never a full-file read) using the same JSONL-parsing approach the ingestor
uses — but the subagent path is strongly preferred for context safety.

## Phase 3 — Discretion pass (mandatory, separate)

Load the `discretion` skill and run **every** candidate through its generalization
gate as a distinct second pass. Keep / abstract / drop. Record a one-line
rationale for each DROP. After this pass, no candidate may contain an internal
system name, project codename, individual name, or work repo path.

## Phase 4 — Diff against existing knowledge

For each surviving learning, locate the right target:

- A **rule/constraint** → `conventions/`
- A **methodology** → `guides/`
- A **quality bar / taste** → `standards/`
- A **structured template** → `formats/`

Read the target SKILL.md. Decide: **new skill**, **amend existing skill**, or
**skip** (already covered). Prefer amending an existing skill over creating a new
one. Produce minimal, surgical edits — never blank-slate a skill file.

## Phase 5 — Apply edits + advance the watermark

1. Make the edits to the SKILL.md files.
2. Advance **both** pointers in `pi/agent/.dream-state.json` per profile, using
   the timestamps actually processed this run:
   - `cursor` ← **max** of (current `cursor`, highest forward timestamp
     processed). If no forward sessions were processed, leave `cursor` unchanged.
   - `floor` ← on first run, the **min** timestamp processed; on a backfill run,
     the **lowest** backfill timestamp processed (drives the old edge downward).
     If only forward sessions were processed on a non-first run, leave `floor`
     unchanged.
   Keep `version: 2` and the `{cursor, floor}` object shape. Set `last_dream` to
   the current ISO date. Skip a profile entirely if it had no work this run.
3. Run the taxonomy validator and stop on any error:
   ```bash
   node pi/agent/scripts/validate-taxonomy.mjs
   ```

## Phase 6 — One reviewable PR (amend if open)

Delegate to the `git-ops` subagent. Behavior:

- If an **open dream PR already exists** (branch `dream/learnings`), **amend it**:
  check out that branch, add the new commits, push. This consolidates multiple
  nights into one PR until Jordan reviews — avoids PR spam and merge thrash.
- Otherwise create branch `dream/learnings`, commit, push, open a PR.

Commit message: conventional, e.g. `chore(skills): codify learnings from dream <date>`.
PR body must include, per learning: the **generalized statement**, its **target
skill**, and **why** it qualified (correction / preference / recurrence). List any
DROPs with their rationale so the audit trail is visible. Never push to `main`.

## Output

A concise summary: count of sessions analyzed per profile (and whether each was
forward or backfill), learnings proposed (with targets), drops (with reasons),
the **pending count** per profile if the cap was hit (so Jordan knows to re-run),
and the PR URL (or "amended existing dream PR"). If nothing new: say so and stop.

## Headless / cron note

This skill is the single code path for both manual and (on personal machines)
cron-driven runs. On the work machine, run it manually inside an authenticated
session — the headless LLM-gateway token cannot refresh non-interactively. The
watermark makes cadence irrelevant: miss days and the backlog is preserved. Each
run is capped at `MAX_SESSIONS_PER_RUN`, so a large backlog drains over several
runs rather than one giant sweep — forward (new) sessions first, then backfill of
older history. Re-run until the output reports no pending sessions.
