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
- **AC4** — GIVEN a problem row THEN its title links to `/practice/<slug>`.
- **AC5** — GIVEN the card header THEN it shows `solved/total` for the whole
  catalogue.
- **AC6** — GIVEN saved progress WHEN rendered THEN each status is Solved,
  Attempted or Not started from the learner's own runs; GIVEN progress can't be
  read THEN statuses show "—" and nothing is invented.
- **AC7** — GIVEN a viewport at 390px THEN the page has no horizontal overflow
  (the table scrolls inside its card).
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
  problem" row with a link. There is no premium, redeem or rules content.
- **AC9a** — GIVEN any month THEN the card, header strip, text and shadows are
  identical (graphite background, neutral text); only the accent hue changes,
  keyed to the month shown: Jan emerald, Feb sapphire, Mar violet, Apr pink, May
  teal, Jun lemon, Jul orange, Aug cyan, Sep indigo, Oct orchid, Nov green, Dec
  ice blue. The hue colours the hexagon month badge, today's date, the
  previous/next highlight and the decorative concentric lines (at very low
  opacity), and is reserved for any future practice-streak or completion
  indicator. Today's-date text stays dark enough for contrast on every hue
  (including lemon and pink).
- **AC10** — GIVEN any date in the calendar THEN it is a link to
  `/practice/<slug>` for that date's problem, chosen as a pure function of the
  ISO date over the catalogue (the same date always opens the same problem),
  and its accessible name is "<date>: <title>".

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
