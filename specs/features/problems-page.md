# Feature: Problems page (`/problems`)

Status: Agreed (user, 2026-11-03; no teammate sign-off)
Owner: Umair
Related: `dashboard-page.md` (the shell), `home-page.md` (AC6–AC8, the landing
table), `auth-access.md`

## Why

The sidebar's Problems entry used to jump to a section of the marketing
landing page. A learner working inside the app wants the full problem list in
the same workspace they are already in, with their own status on each one, and
one click to start.

## User stories

- As a signed-in learner, I want every problem listed in one place with my
  status on each, so that I can pick what to do next.
- As a learner, I want Problems in the sidebar to stay inside the app.

## Acceptance criteria

- **AC1** — GIVEN no session WHEN `/problems` is requested THEN the server
  redirects to `/login?next=%2Fproblems` before reading progress. The page is
  `noindex`.
- **AC2** — GIVEN the sidebar WHEN rendered THEN Problems links to `/problems`
  (not `/#problems`), and on `/problems` it is the current item
  (`aria-current="page"`).
- **AC3** — GIVEN a verified session WHEN `/problems` renders THEN it is inside
  the same `AppShell` as the dashboard (sidebar, search, bell) with a header
  ("Learning workspace" / "Problems") and one card listing every registry
  problem in registry order: number, title, topics, difficulty, status.
- **AC4** — GIVEN a problem row THEN its title opens the shared problem-detail
  modal (AC15) and its Action button links to `/practice/<slug>` (AC14).
- **AC5** — GIVEN the card header THEN it shows `solved/total` for the whole
  catalogue.
- **AC6** — GIVEN saved progress WHEN rendered THEN each status is Solved,
  Attempted or Not started from the learner's own runs; GIVEN progress can't be
  read THEN statuses show "—" and nothing is invented.
- **AC7** — GIVEN a viewport at 390px THEN the page has no horizontal overflow
  (see AC13 and AC16).
- **AC8** — GIVEN `/problems` at 1024px or wider THEN a floating graphite
  calendar widget sits to the right of the list (sticky, with the same hover
  lift as the dashboard's cards); below 1024px it stacks under the list.
- **AC9** — GIVEN the calendar THEN its header is a compact, raised strip that
  pops out above the card (soft shadow, thin neutral line along its lower edge):
  on the left "Day <n>" (today's UTC day of the month), a live "HH:MM:SS left"
  countdown to the end of the UTC day and a small rounded UTC pill; on the right
  previous and next arrows around a hexagon month badge (month number and
  abbreviation) that pops up out of the strip. Below it: the full month and
  year, one UTC month of dates (Sunday first) with today marked, and a "Today's
  challenge" row with a link. There is no premium, redeem or rules content.
- **AC9a** — GIVEN any month THEN the card, header strip, text and shadows are
  identical (graphite background, neutral text); only the accent hue changes,
  keyed to the month shown: Jan emerald, Feb sapphire, Mar violet, Apr pink, May
  teal, Jun lemon, Jul orange, Aug cyan, Sep indigo, Oct orchid, Nov green, Dec
  ice blue. The hue colours the hexagon month badge, today's date, the
  previous/next highlight and the decorative concentric lines (at very low
  opacity), and is reserved for any future practice-streak or completion
  indicator. Today's-date text stays dark enough for contrast on every hue
  (including lemon and pink).
- **AC10** — GIVEN any date up to today in the calendar THEN it is a link to that
  date's daily challenge page (`/challenge/<date>`, `daily-challenge.md`); a date after
  today is a locked, non-link cell. The problem a date names is its PINNED assignment
  (never recomputed), so the same date always opens the same problem even after the
  catalogue changes, and its accessible name is "<date>: <title>" (or "<date>: daily
  challenge" until that day has been pinned).
- **AC11** — GIVEN the list card THEN it has no heading. Its header holds topic
  filter chips on the left ("All topics", then each topic the catalogue has, in
  catalogue order; one at a time, `aria-pressed`), and on the right a Status
  dropdown and the solved tally. Choosing a topic shows only the problems with
  that topic and "All topics" restores them; the filter only narrows rows
  already loaded.
- **AC12** — GIVEN the Status dropdown THEN its options are All, Attempted, Not
  started, Solved and Unsolved. Attempted is every problem with a saved attempt,
  solved or not; Unsolved is attempted but not yet solved; Not started has none;
  Solved is solved. It combines with the topic chips, and an empty result says
  no problems match. When saved progress cannot be read the dropdown is hidden.
- **AC13** — GIVEN the list THEN the table has no scroll box of its own: it is as
  tall as its rows, there is no pagination, and the page has one scrollbar. On a
  desktop the sidebar and the calendar widget stay in place while the table
  scrolls, and the column headings pin to the top of the page scroll.
- **AC14** — GIVEN the table THEN its last column is Action, with Start (not
  started), Continue (attempted, unsolved) or Reattempt (solved), each linking to
  `/practice/<slug>`.
- **AC15** — GIVEN a title WHEN activated (pointer or keyboard) THEN the one shared
  problem-detail modal opens (dashboard-page AC26): title and difficulty, topics,
  status, total attempts, best result, first attempted, last attempted and, if
  solved, first solved and last solved, plus the Practice action; there is no second detail
  system. Escape, the Close button or a click outside closes it and focus
  returns to the title.
- **AC16** — GIVEN a viewport of 700px or less THEN the number, topics and
  difficulty columns are dropped (the difficulty pill moves under the title, and
  topics are in the modal) so the table fits with no sideways scroll and the page
  has no horizontal overflow.
- **AC17** — GIVEN the sidebar THEN it no longer has a Progress entry; this page
  is the place to see every problem's status.

## Data / API

No schema, route or action changes. Reads `getLearningProgress()` and
`buildProblemTable()` (the landing table's builder) only; the date → problem
choice is `problemForDate` in `src/lib/problems/daily-problem.ts`. Copy lives in the
`ProblemsPage` messages namespace; column, difficulty and status labels reuse
`ProblemTable`.

## Edge cases

- Empty catalogue: "No problems yet."
- Progress unavailable: statuses "—", rows still link.
- A problem a signed-in learner hasn't opened: "Not started".

## Tasks

- [ ] Sidebar Problems → `/problems`
- [ ] `/problems` page, list component, styles, messages
- [ ] Calendar widget and date → problem function, with unit tests
- [ ] Spec status board row

## Changelog

- 2026-11-03 — created and agreed from the user's brief.
- 2026-11-03 — list heading removed, topic filter chips and a ten-row scroll added
  (AC11, AC12; user).
- 2026-11-03 — status dropdown, Action column, shared detail modal, single page
  scroll with sticky sidebar and widget, phone columns (AC11–AC17; user).
