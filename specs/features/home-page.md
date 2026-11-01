# Feature: Home page

Status: In progress
Owner: Asad (Track B: visualiser / UI)
Related: `specs/00-product.md` § v1 scope ("Problem list"), `specs/features/fail-and-replay.md`,
design: Option 2 on the [home page canvas](https://claude.ai/artifact/ULL37rXkbfxxE2L6ZuJ56A) (`Landing.dc.html`)

## Why

`/` is still the template placeholder, and nothing links to the practice
pages, so a first-time visitor can't find a problem without typing a URL.
The home page has two jobs: say in one line what TraceCode does, and get
the learner into a problem fast. It shows the product's one idea,
replaying a failing run, as a small debugger-style step table of a real
bug rather than a marketing graphic, and then a plain problem list, the
way coding-practice sites do.

## User stories

- As a first-time visitor, I want to understand in a few seconds what
  TraceCode does, so that I know whether it's for me.
- As a learner, I want one obvious way to start a problem, so that I'm
  writing code within a click.
- As a learner, I want to see every problem with its topics and
  difficulty, so that I can pick what to practise.
- As a signed-in learner, I want to see which problems I've attempted or
  solved, so that I know where I left off.

## Acceptance criteria

- **AC1** — GIVEN anyone WHEN they open `/` THEN the page shows a top
  bar (logo linking to `/`, "Problems", "Progress"), the headline
  "Practice Python. When it fails, watch it run.", one sentence under it,
  a "Solve Two Sum" button and a "See all problems" link.
- **AC2** — GIVEN the home page WHEN the learner clicks "Solve Two Sum"
  THEN they land on `/practice/two-sum`.
- **AC3** — GIVEN the home page WHEN the learner clicks "See all
  problems" or "Problems" in the top bar THEN the page scrolls to the
  problem table (`#problems`). "Progress" goes to `/progress`.
- **AC4** — GIVEN the home page THEN a step table shows the buggy Two Sum
  run: caption `two_sum([3, 2, 4], 6)` with "Expected [1, 2], got
  [0, 0]", rows for steps 1–5 (step, line, i, j, nums[i] + nums[j]),
  step 4 (`i` = 0, `j` = 0, `3 + 3 = 6`) highlighted, and the note
  "Step 4: i and j are both 0, so the 3 is added to itself." It is
  static (no Python runs on the home page).
- **AC5** — GIVEN the step table WHEN the unit tests run THEN a test
  checks it against the committed fixture `src/lib/trace/fixtures/buggy-two-sum.json`
  (the input, the actual and expected results, and `i`/`j` at the
  highlighted step), so the home page can't drift from what the engine
  really produces.
- **AC6** — GIVEN the problem registry (`PROBLEMS`) WHEN the home page
  renders THEN the problem table has one row per problem, in registry
  order, with columns #, Title (linking to `/practice/<slug>`), Topics
  (concept tags, capitalised, comma-separated), Difficulty (Easy /
  Medium / Hard) and Status. Adding a problem to the registry adds a row
  with no home-page change.
- **AC7** — GIVEN a signed-in learner with saved progress WHEN the home
  page renders THEN each row's Status shows "Solved", "Attempted" or
  "Not started" from their `problem_progress`.
- **AC8** — GIVEN a signed-out visitor, OR Supabase not configured, OR
  the progress tables unavailable WHEN the home page renders THEN Status
  shows "—" in every row, a line under the table says "Sign in to track
  your progress.", and the page still renders (no error, no 500).
- **AC9** — GIVEN a phone-width screen (390 px) WHEN the home page renders
  THEN the hero, step table and problem table stack in one column, the
  tables scroll sideways inside their own box, and the page itself has no
  horizontal scroll.
- **AC10** — GIVEN search engines WHEN they read `/` THEN it keeps its
  `PUBLIC_PAGES` entry with a `meta.title` (30–60 chars) and
  `meta.description` (70–160) that describe TraceCode, and `lastModified`
  moves to the ship date (`docs/rules/seo.md`).

## Data / API

- **No new models, routes or actions.** Problems come from `PROBLEMS`
  (`src/lib/trace/problems.ts`). Status reuses `getLearningProgress()`
  (`src/server/learning/progress.ts`), which already degrades to
  `authenticated: false` / `available: false`.
- The page is a Server Component; it ships no client JavaScript of its
  own (no Pyodide, no editor).
- Copy lives in the `HomePage` messages namespace (`messages/en.json`).
- Styling: Tailwind utilities on the design tokens in
  `src/app/globals.css`. This PR sets those tokens to TraceCode's palette
  (the template's neutral blue starter set becomes the green/sage one the
  practice pages use), light and dark; no hard-coded hex in components
  (`DESIGN.md`).
- Analytics: none in this slice (no new events). `problem_opened` from
  the home page can come with the analytics pass.
- `01-architecture.md` / `02-trace-contract.md`: no changes needed.

## Edge cases

- Empty or first-time: a new visitor sees "—" statuses and the sign-in
  line; never an empty table (the registry always has at least Two Sum).
  If `PROBLEMS` were ever empty, the table shows "No problems yet."
- Supabase or the database down: same as signed out (AC8). Never blocks
  the page.
- Another user's data: status is read only for the session's own user id
  (`getLearnerId()`), never from a URL or form value.
- A problem slug removed from the registry but still in a learner's
  `problem_progress`: ignored (rows come from the registry, not the DB).
- Long titles or many tags: wrap inside the cell; the table scrolls
  sideways on narrow screens.

## Tasks

Track B (UI)

- [x] Replace the template palette in `src/app/globals.css` with
      TraceCode tokens (light + dark), keeping token names
- [x] `SiteHeader` component (logo, Problems, Progress)
- [x] Home hero + static step table (`src/components/home/`)
- [x] Problem table from `PROBLEMS` + statuses from `getLearningProgress()`
- [x] `HomePage` copy and meta in `messages/en.json`; bump `lastModified`
- [x] Unit test: step table matches the buggy Two Sum fixture (AC5)
- [x] Unit test: problem rows from the registry, status mapping (AC6–AC8)
- [x] Playwright: AC1–AC3 and AC9 (390 px, no horizontal scroll)

## Decisions

1. **No "Sign in" in the top bar yet.** There's no sign-in page; it's
   added with the auth UI.
2. **Signed-out status is "—".** Progress isn't saved for signed-out
   learners (attempt history lives only in page memory). Saving
   solved/attempted in the browser so they see a status too touches the
   practice page as well, so it gets its own spec.

## Changelog

- 2026-11-01 — created (draft, from design Option 2).
- 2026-11-01 — agreed; open questions resolved as proposed (see Decisions).
- 2026-11-01 — built; Shipped once merged to `main`.
