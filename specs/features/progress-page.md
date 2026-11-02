# Feature: Progress page

Status: In progress
Owner: Asad (Track B: visualiser / UI)
Related: `specs/00-product.md` § How users see progress, `specs/features/home-page.md`,
design: "Progress — signed in" and "Progress — signed out" on the
[design canvas](https://claude.ai/artifact/ULL37rXkbfxxE2L6ZuJ56A) (approved 2026-11-01)

## Why

Seeing your own track record is what turns separate practice sessions into
learning that sticks: which problems you've cracked, which are still open,
and whether your runs are getting better. `/progress` exists today as a raw
list of slugs and counts with no styling. This slice gives it the same plain
look as the home page and shows only what the app really records.

## User stories

- As a signed-in learner, I want to see which problems I've solved or
  attempted and my best result on each, so that I know what to do next.
- As a signed-in learner, I want to see my recent runs, so that I can see
  whether I'm getting closer.
- As a signed-in learner, I want to see how many problems I've solved per
  topic, so that I know which topics need practice.
- As a signed-out visitor, I want to know why there's nothing here and how
  to get started.

## Acceptance criteria

- **AC1** — GIVEN anyone WHEN they open `/progress` THEN they see the same
  top bar as the home page with "Progress" marked as the current page
  (`aria-current="page"`), and the heading "Your progress".
- **AC2** — GIVEN a signed-out visitor, OR Supabase not configured WHEN
  `/progress` renders THEN it shows "Nothing saved yet" with a line
  explaining that progress is saved once signed in and that runs last only
  while the problem page is open, a "Solve Two Sum" button
  (`/practice/two-sum`), a "See all problems" link (`/#problems`), and the
  list of what the page shows once signed in. No tables, no error.
- **AC3** — GIVEN a signed-in learner whose saved progress can't be read
  (tables missing, database down) WHEN `/progress` renders THEN it says
  "Saved progress is unavailable right now." and still renders (no 500).
- **AC4** — GIVEN a signed-in learner with saved progress WHEN `/progress`
  renders THEN a summary shows Solved (n of total problems), Attempted
  (problems with at least one run) and Runs (total runs across problems).
- **AC5** — GIVEN the same learner THEN a Problems table lists every
  problem in the registry, in registry order, with Status (Solved /
  Attempted / Not started), Best result ("3/3 tests", or "—" with no
  runs), Runs, Solved (date first solved, or "—") and a link to the
  problem ("Open" when solved, "Continue" when attempted, "Start"
  otherwise).
- **AC6** — GIVEN the same learner THEN a Recent runs table lists their
  last 10 runs, newest first, with the problem's title, the result
  ("2/3 passed", green when all passed, red otherwise) and when it ran,
  formatted in the viewer's own locale and time zone. With no runs it
  says "No runs yet."
- **AC7** — GIVEN the same learner THEN a By topic table lists each
  concept tag across the registry (capitalised) with solved/total
  problems for that tag, in first-seen registry order.
- **AC8** — GIVEN a phone-width screen (390 px) THEN the sections stack in
  one column, tables scroll sideways inside their own box, and the page
  itself has no horizontal scroll.

## Data / API

- **No new models, routes or actions.** Reuses `getLearningProgress()`
  (`src/server/learning/progress.ts`), extended with each row's
  `firstSolvedAt` (already stored on `problem_progress`, ISO string or
  `null`) for the Solved column.
- Problem titles and topics come from `PROBLEMS`; a saved slug that's not in
  the registry is left out of the Problems and By topic tables, and shown by
  its slug in Recent runs.
- Pure view logic in `src/lib/progress/progress-view.ts` (unit-tested);
  the page and its sections are Server Components. The only client code is
  a small `LocalTime` that formats run times in the viewer's locale and time
  zone (the server would otherwise format them in UTC).
- Copy in the `ProgressPage` messages namespace. The page stays
  `noindex` (a personal page), so it isn't in `PUBLIC_PAGES`.
- Analytics: none in this slice.

## Edge cases

- Signed in with no runs: summary is 0 of N / 0 / 0, every problem "Not
  started", Recent runs says "No runs yet.", By topic shows 0/N per tag.
- `testsTotal` 0 on a saved row (no run completed): Best result "—".
- Times: the server renders the date only; the viewer's browser fills in
  the local date and time, so there's no hydration mismatch.
- Another user's data: read only for the session's own user id
  (`getLearnerId()`), never from a URL or form value.
- Sign-in itself doesn't exist yet (being discussed with Umair); until it
  does, every visitor sees AC2. The signed-in views are covered by unit
  tests on the view logic.

## Tasks

- [x] Add `firstSolvedAt` to `ProgressRow` in `getLearningProgress()`
- [x] `buildProgressView()` in `src/lib/progress/` + unit tests (AC4–AC7, edge cases)
- [x] `SiteHeader` marks the current page (AC1)
- [x] Progress sections + `LocalTime` client component
- [x] `ProgressPage` copy in `messages/en.json`; page metadata from messages
- [x] Playwright: AC1, AC2, AC8 (signed-out, which is every visitor today)

## Decisions

1. Built before sign-in exists: the signed-out state is what everyone sees
   for now, and the signed-in state needs no changes once auth lands.
2. Mastery, hints used and trends over time (`00-product.md`) are left out:
   the app doesn't record block rebuilds or hint levels per problem yet, so
   showing them would mean inventing numbers.

## Changelog

- 2026-11-01 — created from the approved design; agreed.
- 2026-11-01 — built; Shipped once merged to `main`.

- 2026-11-02 — `/progress` now requires a session: signed-out requests redirect to `/login?next=/progress` (`auth-access.md` AC4). The signed-out state (AC2) is no longer reachable.
