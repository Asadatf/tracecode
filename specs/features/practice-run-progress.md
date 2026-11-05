# Feature: Practice Run progress

Status: Draft — written from the product owner's brief; needs sign-off
Owner: Track B (visualiser) — touches Track A's worker protocol, see
`specs/02-trace-contract.md` § Amendment: `test_result` worker event
Related: `specs/features/fail-and-replay.md` AC2, `specs/features/practice-trace-condensing.md`,
`specs/features/practice-workspace-layout.md`

## Why

Pressing Run used to show nothing until every test had finished, then everything at
once. A slow solution looked frozen, and the learner could not see which test it was
stuck on. Showing each test's real result the moment it finishes makes a run
legible, and a failure can be read while the rest are still going.

## User stories

- As a learner, I want the Tests tab to open and show that my code is running as soon
  as I press Run, so that I know it started.
- As a learner, I want each test's result to appear as it finishes, with its details if
  it failed, so that I can start reading a failure before the run ends.

## Acceptance criteria

- **AC1** — GIVEN any results tab (or a collapsed results pane, or the phone's Code view)
  WHEN Run starts THEN the Tests tab is active and visible, and the tests show as running.
- **AC2** — GIVEN a run in progress WHEN a test finishes THEN its row shows Passed or
  Failed at once, the next test shows Running and the rest Pending, in the problem's own
  test order. Every result shown was reported by the worker as that test finished; none is
  simulated, delayed or replayed from a finished batch.
- **AC3** — GIVEN a failing test or a runtime error WHEN it is reported THEN its expected
  value, actual value or error type, message and line are shown immediately.
- **AC4** — GIVEN a run in progress THEN the count (`n / total done`, `k failed`) is the
  number of events received, including validation checks, and the condensed view is kept:
  the problem's visible tests are listed, the other checks are one summary line
  (`n of m more validation checks run`) with every failing check listed as it fails.
- **AC5** — GIVEN the run finishes THEN the view is replaced by the existing finished
  results, built from the final `RunResult` (the only authoritative result), and the status
  line says `k / total passed`.
- **AC6** — GIVEN the learner picks another tab during a run THEN the run does not switch
  tabs again, before or after it finishes.
- **AC7** — GIVEN a run in progress WHEN Run is pressed again THEN nothing is started (runs
  are single-flight, as today); a later run never shows an earlier run's results.
- **AC8** — GIVEN a run that times out or hits an engine error THEN the existing message is
  shown, followed by the tests that did finish (`n of m tests finished before the run
stopped`); they are not graded, saved or counted, and the next Run starts clean.
- **AC9** — GIVEN a run THEN the page announces one concise status ("Running tests…", then
  the final count), not each test, and uses the small branded loader — never the
  full-screen navigation curtain.
- **AC10** — GIVEN the same code and tests THEN the final `RunResult`, grading, in-place
  mutation judging, streak and spaced-review rules, replay and trace condensing are
  identical to before.

## Data / API

- Worker protocol: one additive `test_result` message (`specs/02-trace-contract.md`).
- `runCode(request, { onTestResult })` — optional, `runCode` only.
- No database, route, analytics or Daily Challenge change.

## Edge cases

- Empty / first-time state: a problem with no condensed checks shows only the visible rows.
- Errors and timeouts: see AC8. The 5 s execution limit still covers the whole run.
- A syntax error or missing entry: no tests run, no live rows; the existing message shows.
- Page left mid-run: late events are ignored.
- Limits: unchanged (`RUN_TIMEOUT_MS`, value limits).
- A pane the learner maximised stays as they set it, so Tests may not be on screen then.

## Tasks

- [x] Worker `test_result` event, engine `onTestResult`, `live-run` view model
- [x] Results panel with the live view; Run reveals the Tests tab
- [x] Tests: `live-run`, `run-streaming` (real worker + Pyodide), `run-progress`
- [ ] Contract owners' sign-off on the amendment
- [ ] Signed-in browser check of a problem with validation checks

## Changelog

- 2026-11-05 — created.
