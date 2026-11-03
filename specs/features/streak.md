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
  one attempt with status `completed` on it. Logins, syntax errors, engine errors
  and timeouts do not count, and a day counts once however many attempts it holds.
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

Read-only. `getStreakSummary()` selects `createdAt` and `status` of the learner's
completed attempts in the last 730 days (a longer streak reads as the window),
scoped to the session user. Nothing is stored; no migration. The month layout is
shared with the Problems calendar (`src/lib/calendar/month-grid.ts`).

## Edge cases

- 23:59:59 UTC and 00:00:00 UTC are different days.
- A chain that ended yesterday is still alive until the UTC day ends.
- The notification bell turns orange with unread notifications; in development
  builds it also lists three hardcoded sample notifications.

## Tests

`src/lib/streak/*.test.mts`, `src/lib/calendar/month-grid.test.mts`,
`e2e/progress.spec.ts` (AC2).
