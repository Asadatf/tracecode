# Feature: Practice test summary and condensed execution replay

Status: Agreed (Umair; no teammate sign-off)
Owner: Umair
Related: `specs/02-trace-contract.md` (unchanged), `specs/features/fail-and-replay.md`,
`specs/features/practice-workspace-layout.md`, `specs/features/daily-challenge.md` (its hidden
suites and grading are untouched)

## Why

Practice showed up to 26 results per problem and a replay that could list 2,000 near-identical
steps. That buries the few things a learner needs to read. This keeps every check and every
recorded step, but shows a small teaching set first and folds repeats behind one clear line.

## Practice test results

- **AC1** — GIVEN a problem THEN its `tests` are all still run and still decide pass/fail,
  count in "x / y passed", and are saved as before. Nothing about grading changes.
- **AC2** — GIVEN a problem THEN `visibleTestIds` names a teaching set of 5–6 distinct, readable
  cases (a normal case, the boundaries, and the common failure shapes). Only those are listed
  one by one. Two Sum gained three distinct cases (negatives, a zero pair, an answer at the end)
  to reach 6; the other problems keep their full tests.
- **AC3** — GIVEN the remaining tests (edge cases, larger inputs, performance) THEN they are
  one summary row, "N more validation checks passed". A **failing** validation check is never
  hidden: failures are always listed, and "N of M more validation checks failed" says so. The
  passing ones open with a keyboard-operable disclosure.
- **AC4** — GIVEN a problem with no `visibleTestIds` THEN every test is shown.
- **AC5** — The Daily Challenge's hidden suites and server grading are unchanged (a test pins
  their fingerprint).

## Condensed replay

- **AC6** — GIVEN a recorded trace THEN `condenseTrace` finds runs where the SAME sequence of
  events (event kind, line, depth change) repeats, and where each pass has the SAME state
  effect: the same variables changed, in the same kind of way (a number changed, a flag
  flipped, a list grew by one, a list changed in place, a dict gained an entry). Two passes that
  run the same lines but change different things are never grouped.
- **AC7** — GIVEN such a run of at least 7 passes THEN the first 3 passes and the last pass are
  shown, and the passes between are folded into one line: "This pattern repeats for the next N
  iterations" (or "recursive calls" / "repeats"), with the lines and the variables that change
  on every pass. N is a count of real repeated passes in the trace.
- **AC8** — GIVEN an exception, or the entry function's final return, THEN it is never folded;
  neither is the first step. The final state, return value and errors are always visible.
- **AC9** — GIVEN values the recording cut off (large lists beyond the size bound) THEN the
  summary says some values are cut off and that changes inside the cut-off part are not
  compared. It never claims anything the recording does not contain.
- **AC10** — GIVEN the replay THEN Previous/Next skip a fold and say so ("N steps are skipped")
  with "Show every step"; the execution history shows each fold as one button
  (`aria-expanded`, `aria-controls`); and "Show full trace" (`aria-pressed`) turns folding off
  everywhere. The step numbers and "Step x of N" always refer to the full recorded trace.
- **AC11** — No explanation is generated: the summary is built only from the trace. The trace
  collection limits (2,000 steps, the execution timeout, the value size bounds) are unchanged;
  a truncated trace still says "Truncated · first N steps".

## Trade-offs

- Folding is a display choice. Nothing is removed from the trace, and a fold can be opened.
- A fold is conservative by design: if the state effect differs even slightly between passes, the
  passes stay visible. That keeps accuracy over brevity.
- Because very large lists are recorded only up to 50 items, a change beyond that is not part of
  what is compared; the summary says so.

## Tests

`src/lib/trace/visible-tests.test.mts`, `src/lib/trace/condense.test.mts`,
`src/components/trace/replay-condense.test.mts`.

## Changelog

- 2026-11-05 — created.
