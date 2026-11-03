# Feature: Study plans

Status: Agreed (Asad, 2026-11-03; for Umair to review in the PR)
Owner: Asad
Related: `specs/features/problems-page.md`, `specs/features/learning-recommendations.md`,
`specs/features/problem-pack-classics.md`

## Why

A list of problems tells a beginner _what exists_, not _what order to learn it
in_. LeetCode's study plans ("Top Interview 150", "LeetCode 75") are popular
because they turn a catalogue into a path with a visible finish line. A few
short, ordered plans by topic give TraceCode learners that path, using the
progress the app already saves. Plans are fixed and hand-curated; they do not
replace the personalised recommendations (M7), which still say "what next for
you"; a plan says "what next in this topic".

## User stories

- As a beginner, I want a short ordered path through a topic, so that I know
  where to start and what comes next.
- As a learner, I want to see how far through a plan I am, so that I am
  motivated to finish it.

## Acceptance criteria

- **AC1** — GIVEN a signed-out visitor WHEN they open `/plans` THEN they are
  redirected to sign in and come back to `/plans` afterwards (same rule as
  `/problems`).
- **AC2** — GIVEN a signed-in learner WHEN they open `/plans` THEN they see
  every plan as a card with its title, a one-line description, the number of
  problems, and "n of m solved" with a progress bar.
- **AC3** — GIVEN a plan WHEN the learner opens it THEN its problems are listed
  in plan order with title, difficulty and status (Solved / Attempted / Not
  started), each linking to its practice page.
- **AC4** — GIVEN a plan with unsolved problems THEN a "Continue" button goes
  to the first unsolved problem in plan order; GIVEN all solved THEN the card
  says "Completed" instead.
- **AC5** — GIVEN the app navigation WHEN signed in THEN it has a "Study plans"
  item after Problems, marked current on `/plans`.
- **AC6** — GIVEN the plan definitions THEN every slug in every plan exists in
  the problem registry and no plan repeats a slug (enforced by a unit test).
- **AC7** — GIVEN progress can't be read (database down) WHEN the page renders
  THEN plans still show, with statuses shown as "—" and a note that progress
  is unavailable.

## Data / API

- No new tables. Plans are static data in `src/lib/plans/plans.ts`:
  `{ slug, title, description, problems: string[] }[]`, validated by a test.
- Initial plans (with the new problems from `problem-pack-classics.md`):
  - **Arrays and hashing:** two-sum, contains-duplicate, valid-anagram,
    majority-element, best-time-to-buy-and-sell-stock.
  - **Two pointers:** valid-palindrome, move-zeroes, merge-sorted-array.
  - **Searching and stacks:** binary-search, valid-parentheses.
  - **Step by step (dynamic programming):** climbing-stairs, maximum-subarray.
- A pure `buildPlanView(plans, problems, progress)` in `src/lib/plans/plan-view.ts`,
  reusing `getLearningProgress()`; unit-tested.
- Routes: `/plans` and `/plans/[slug]` (noindex, personal pages). Messages
  namespace `PlansPage`.
- Analytics: none in this slice.

## Edge cases

- Empty / first-time: every plan at "0 of m solved".
- A plan slug that names a problem later removed: caught by AC6 in CI.
- Unknown `/plans/<slug>`: 404.
- Overlap with recommendations: plans never reorder by learner data; the
  dashboard keeps its own "what next".

## Tasks

- [ ] `plans.ts`, `plan-view.ts` + unit tests (AC4, AC6, AC7).
- [ ] `/plans` and `/plans/[slug]` pages in the app shell; nav item.
- [ ] e2e: signed-out redirect; page renders plans.

## Changelog

- 2026-11-03 — created.
