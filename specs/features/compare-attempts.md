# Feature: Compare attempts

Status: In progress (built 2026-11-03; for Umair to review in the PR)
Owner: Asad
Related: `specs/features/practice-workspace-layout.md`, `specs/features/fail-and-replay.md`

## Why

The moment a failing solution starts passing is the moment the learner
understands something, but the change that did it is easy to miss after many
edits. Showing the failing and the passing attempt side by side, with the
changed lines marked, turns "it works now" into "this is what fixed it".
It reuses the attempt history the workspace already keeps.

## User stories

- As a learner, I want to see what changed between two of my attempts, so
  that I know which edit made my code pass.

## Acceptance criteria

- **AC1** — GIVEN fewer than 2 attempts WHEN the learner opens History THEN
  there is no Compare control.
- **AC2** — GIVEN 2 or more attempts WHEN the learner opens History THEN a
  "Compare attempts" control offers two pickers, From and To, each listing
  attempts as "#n · 2 / 3 passed · 14:05".
- **AC3** — GIVEN at least one failing attempt followed by a passing one THEN
  the pickers default to the last failing attempt before the first pass (From)
  and that first pass (To); otherwise to the two most recent attempts.
- **AC4** — GIVEN two chosen attempts WHEN the comparison shows THEN it is a
  line-by-line view where removed lines are marked red with "−", added lines
  green with "+", unchanged lines plain, with line numbers for each side.
- **AC5** — GIVEN two identical attempts THEN it says "No changes between these
  attempts" instead of an empty diff.
- **AC6** — GIVEN the comparison is open WHEN the learner presses "Load From
  version" or "Load To version" THEN that attempt's code goes into the editor
  (same as Load code today).

## Data / API

- No server, database or analytics changes; uses the in-memory attempt list.
- `src/lib/trace/line-diff.ts`: pure `lineDiff(a, b)` returning
  `{ kind: 'same' | 'added' | 'removed', text, aLine?, bLine? }[]` using a
  longest-common-subsequence over lines; unit-tested. Trailing whitespace is
  ignored when matching so re-indentation by Format shows as a change but
  trailing spaces don't.

## Edge cases

- Empty / first-time: AC1.
- Very long sources: attempts are capped by the editor in practice; the LCS is
  O(n·m) on lines, fine for a few hundred lines. Above 2 000 lines on either
  side, show "Too long to compare" instead.
- Signed-in learners: only this session's attempts are compared (the saved
  history from earlier sessions is out of scope for this slice).

## Tasks

- [ ] `line-diff.ts` + unit tests (identical, add-only, remove-only, mixed,
      whitespace).
- [ ] `attempt-compare.tsx` in the History tab, with defaults (AC3).
- [ ] e2e: fail then pass → compare shows the changed line.

## Changelog

- 2026-11-03 — created.
