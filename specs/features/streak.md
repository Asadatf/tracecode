# Feature: Streak flame and navigation cleanup

Status: Agreed (Umair; no teammate sign-off)
Owner: Umair
Related: `specs/features/dashboard-page.md`, `specs/features/problems-page.md`,
`specs/features/progress-page.md`

## Why

Progress now lives on Overview, so the separate Progress page and its sidebar
item are retired. A small streak flame beside the notification bell shows a
learner's consecutive-day practice, derived only from what they really saved.

## Acceptance criteria

- **AC1** — GIVEN the authenticated sidebar THEN it lists only Overview and
  Problems, with Settings and Sign out pinned at the bottom.
- **AC2** — GIVEN a request to the retired `/progress` route THEN it redirects to
  Overview (a signed-out visitor then continues to Sign In). No attempt record,
  analytics or recommendation logic is changed or removed, and no header or
  notification links to `/progress` any more.
- **AC3** — GIVEN a signed-in learner THEN the shared toolbar shows a flame
  immediately left of the notification bell; signed out, nothing is shown.
- **AC4** — GIVEN a day THEN it is a UTC calendar day (the same day the Problems
  calendar and its UTC chip use), and it is active when the learner saved at least
  one _qualifying_ attempt on it. An attempt qualifies when it ran to completion
  (status `completed`, whether or not every test passed — a failing genuine run, a
  reattempt of a solved problem and a revision all count) AND the server judged it
  meaningful: the source differs from the problem's canonical starter in more than
  whitespace and comments. Untouched starter code, whitespace/comment-only edits,
  empty code, logins, syntax errors, engine errors and timeouts do not count, and
  a day counts once however many attempts it holds.
- **AC4a** — GIVEN an attempt is saved THEN the server alone decides whether it is
  meaningful, from the submitted source and the catalogue starter, and stores that
  on the attempt (`Attempt.meaningful`). A `meaningful` value sent by the browser is
  ignored. The attempt itself is always saved (starter-only runs remain evidence
  for recommendations); only the streak ignores it. An unknown problem slug is not
  meaningful.
- **AC4b** — GIVEN an attempt saved before `Attempt.meaningful` existed (null)
  THEN it is not re-judged and still counts if it completed, so no learner's
  history changes retroactively.
- **AC5** — GIVEN the current chain of consecutive active days ending today or
  yesterday THEN days 1 and 2 leave the flame neutral gray with no number; from
  day 3 it is orange with a count badge showing the streak; a whole day with no
  active attempt breaks the chain, the flame goes neutral, and the next active day
  starts a new chain at 1.
- **AC6** — GIVEN the flame is clicked or activated by keyboard THEN a popover
  shows the current streak, the longest streak and a month calendar of active days
  (previous/next month), closes on Escape (focus returns to the flame) or an
  outside click, and is labelled for screen readers.
- **AC7** — GIVEN the streak cannot be read THEN the flame stays neutral with no
  number and the popover says it is unavailable. No value is ever estimated.

## Data / API

`getStreakSummary()` selects `createdAt`, `status` and `meaningful` of the
learner's completed, not-`meaningful = false` attempts in the last 730 days (a
longer streak reads as the window), scoped to the session user. The streak itself
is still derived, never stored. One nullable column is added, `Attempt.meaningful`
(written by `saveAttempt`; null for older rows). If the column's migration has not
run yet, writes and the streak read fall back to the previous behaviour instead
of failing. The month layout is shared with the Problems calendar
(`src/lib/calendar/month-grid.ts`).

Meaningful-code check: `src/lib/streak/meaningful-code.ts` tokenises both sources
(strings kept exactly, comments and whitespace dropped, block depth kept) and
compares them; it never executes code and uses no AI.

## Edge cases

- Re-indenting a line into a different block is a change; re-spacing the same
  structure is not. Adding a docstring, `pass` or any other token counts as a
  change — the check detects untouched starters, not effort.
- The browser reports `status`, so the server cannot yet prove a run really
  completed; server-authoritative grading is a later milestone.
- 23:59:59 UTC and 00:00:00 UTC are different days.
- A chain that ended yesterday is still alive until the UTC day ends.
- The notification bell turns orange with unread notifications; in development
  builds it also lists three hardcoded sample notifications.

## Tests

`src/lib/streak/*.test.mts`, `src/lib/learning/save-attempt-input.test.mts`,
`src/lib/calendar/month-grid.test.mts`,
`e2e/progress.spec.ts` (AC2).
