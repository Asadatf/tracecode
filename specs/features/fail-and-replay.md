# Feature: Fail and replay (demo slice — Two Sum)

Status: Draft
Owner: Track A (engine) + Track B (visualiser), see `specs/02-trace-contract.md`
Related: `specs/00-product.md` § Core loop steps 1–3, ADR-0001

## Why

This is the one complete flow the first demo has to show: a learner's
Python solution fails a test, and stepping through its execution shows
_why_ — the moment their mental model and the program part ways. Hints,
block rebuild and progress build on top of it later.

## User stories

- As a learner, I want to run my Two Sum solution against the tests, so
  that I know whether it works.
- As a learner whose solution failed, I want to step through the failing
  test's execution and watch the variables, loops and index pointers, so
  that I can see why it returned the wrong answer.

## Acceptance criteria

- **AC1** — GIVEN the Two Sum problem page WHEN it loads THEN the
  statement, starter code in an editor, and the visible tests are shown,
  and the Python runtime starts loading in the background with a visible
  loading state.
- **AC2** — GIVEN code in the editor WHEN the learner presses Run THEN
  each test shows pass or fail, with expected vs. actual for failures.
- **AC3** — GIVEN the self-pairing bug (fixture in
  `specs/02-trace-contract.md`) WHEN Run completes THEN `t1` passes, `t2`
  fails with actual `[0, 0]`, and a "Replay" action is offered on `t2`.
- **AC4** — GIVEN Replay is open WHEN the learner steps forward/back or
  scrubs THEN the current line is highlighted, all locals are shown with
  changed ones emphasised, active loops show their iteration number, and
  `i`/`j` are drawn as pointers under the `nums` array.
- **AC5** — GIVEN code with a syntax error WHEN Run is pressed THEN the
  error line and message are shown and no tests run.
- **AC6** — GIVEN code with an infinite loop WHEN Run is pressed THEN
  after the timeout the run is reported as timed out and the page stays
  responsive.
- **AC7** — GIVEN a passing solution WHEN Run completes THEN all tests
  pass and no Replay is offered.

## Data / API

- No persistence required for the demo; the problem can be a static
  fixture. Attempt saving (`specs/01-architecture.md`) comes after.
- Contract: `RunRequest`/`RunResult` in `specs/02-trace-contract.md`.
- Analytics: `code_run` (passed, testsPassed, testsTotal),
  `trace_replay_opened`, `trace_step_viewed` (stepIndex) — confirm names
  against `docs/rules/analytics.md` when implementing.

## Edge cases

- Runtime still loading when Run is pressed: queue the run, don't error.
- Exception mid-run (e.g. `IndexError`): the test fails with the error,
  and the trace ends on an `exception` step at the raising line.
- Trace hits `maxSteps`: show the partial trace with a "truncated" notice.
- Pointer index out of range: drawn past the end of the array, not hidden.
- Learner deletes or renames `two_sum`: a clear "function `two_sum` not
  found" error, not an engine crash.

## Tasks

Track A (engine)

- [ ] Zod schemas in `src/lib/trace/contract.ts` (shared — agree first)
- [ ] Worker + lazy Pyodide load, `runCode()` with timeout
- [ ] Test harness calling `entry` with `args`, comparing to `expected`
- [ ] `sys.settrace` tracer producing `Step[]`, loops and pointers
- [ ] Unit test: Two Sum buggy code reproduces the fixture

Track B (visualiser)

- [ ] Problem page: statement, editor (lazy), tests list
- [ ] Results panel driven by `RunResult`
- [ ] Stepper: line highlight, locals table, loop badges, array pointers
- [ ] Build and test against the fixture before the engine lands
- [ ] e2e: AC2–AC4 with the real engine once integrated

## Changelog

- 2026-10-29 — created (draft for team call).
