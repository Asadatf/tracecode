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
replaying a failing run, as a fixture-backed, user-controlled guided tour
of a real bug rather than a marketing graphic. The visitor can move through
Write → Run → Explore → Improve with explicit controls, then choose a real
problem from the dynamic catalog. The preview is illustrative and never claims
to execute Python on the landing page.

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
  a "Solve Two Sum" button and a "See all problems" link. A signed-out
  visitor sees "Sign in / Register" in the top bar linking to `/login`;
  a signed-in learner sees "Dashboard" linking to `/dashboard`.
- **AC2** — GIVEN the home page WHEN the learner clicks "Solve Two Sum"
  THEN they land on `/practice/two-sum`.
- **AC3** — GIVEN the home page WHEN the learner clicks "See all
  problems" or "Problems" in the top bar THEN the page scrolls to the
  problem table (`#problems`). "Progress" goes to `/progress`.
- **AC4** — GIVEN the home page THEN the first interaction is available without
  scrolling and a guided preview is explicitly labelled illustrative, not live
  Python execution. It exposes Write, Run, Explore and Improve stage controls plus
  Run, Previous, Next and Reset. The preview begins at Write; Run reveals the
  failing result; Explore steps through the trace; Improve explains the
  self-pairing bug and links to `/practice/two-sum`.
- **AC5** — GIVEN the guided preview WHEN its data projection and browser tests run
  THEN they check it against the committed fixture
  `src/lib/trace/fixtures/buggy-two-sum.json` and show `two_sum([3, 2, 4], 6)`,
  expected `[1, 2]`, actual `[0, 0]`, source lines from the trace, and steps 1–5.
  At step 4 the active line is `if nums[i] + nums[j] == target:`, both `i` and `j`
  are `0`, both pointers target the first array cell, and the sum is `3 + 3 = 6`.
  No Python runs on the landing page.
- **AC6** — GIVEN the problem registry (`PROBLEMS`) WHEN the home page
  renders THEN the problem table has one row for each of the first six
  problems, in registry order (the page is an introduction; a "View all
  problems" link goes to `/problems`, or through Sign In to it for a
  signed-out visitor; the heading copy never states a problem count), with columns #, Title (linking to `/practice/<slug>`), Topics
  (concept tags, capitalised, comma-separated), Difficulty (Easy /
  Medium / Hard) and Status. Adding problems to the registry never makes
  the home table longer than six rows.
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
- **AC11** — GIVEN pointer, keyboard or touch input WHEN the learner uses the guided
  preview THEN stage controls and Run/Previous/Next/Reset are real buttons, expose
  focus visibly, direct stage selection updates predictably, and the current
  result or explanation is announced without moving keyboard focus.
- **AC12** — GIVEN `prefers-reduced-motion: reduce` WHEN the page renders or the tour
  changes state THEN content remains complete and operable, decorative motion and
  stagger are disabled, and state changes use no spatial animation.
- **AC13** — GIVEN widths of 1440, 1280, 768 and 390 px WHEN the page renders THEN
  the floating header, hero, preview, narrative, learning loop, catalog and closing
  CTA remain readable; the preview stacks where needed; and the document has no
  horizontal overflow.
- **AC14** — GIVEN the completed page WHEN its boundary is inspected THEN the route
  and static sections remain Server Components. The motion coordinator and guided preview are Client
  Component; it receives the serializable fixture projection and imports no Pyodide,
  worker, grading, database or AI code.
- **AC15** — GIVEN a device that prefers either light or dark mode WHEN the public
  Landing Page renders THEN its full-width sections retain the approved alternating
  rhythm: green/graphite hero, white trace narrative, green/graphite learning loop,
  white problem catalog, and green/graphite final CTA. The catalog table stays white for readable contrast. The hero, header,
  learning loop and closing CTA use the
  supplied screenshot's dark palette in both device themes: background ,
  surfaces / , mint accent , primary text ,
  and muted text . The floating header is translucent dark green;
  the hero retains the saved page's radial mint glow and concentric rings.
  The preview has dark chrome, a pale code panel and active stage,
  and mint controls with dark text. The learning-loop cards use dark surfaces
  with mint accents; the learning loop and closing CTA have continuous full-width
  radial mint glows on the same near-black green background as the hero.
- **AC16** — GIVEN a signed-in learner WHEN they open `/` THEN they are
  redirected to `/dashboard`; the landing page is for visitors only. The app
  shell's logo links to `/dashboard`, so it never drops a learner out of the
  app onto the landing page.

## Data / API

- **No new models, routes or actions.** Problems come from `PROBLEMS`
  (`src/lib/trace/problems.ts`). Status reuses `getLearningProgress()`
  (`src/server/learning/progress.ts`), which already degrades to
  `authenticated: false` / `available: false`.
- The page stays a Server Component. A small motion coordinator and one narrow guided-preview Client Component
  owns local tour state and event handlers. It receives only the serializable
  fixture projection and imports no Pyodide, editor, engine, grading, database,
  authentication or AI module.
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
- [x] Landing-only floating header preserving the original `⌁` treatment
- [x] Fixture-backed guided tour Client Component with all controls (AC4/AC5/AC11)
- [x] Graphite narrative, learning-loop section and final CTA
- [x] Responsive and reduced-motion styling (AC12/AC13)
- [x] Playwright tour, keyboard, reduced-motion and viewport coverage
- [x] Desktop and mobile visual review screenshots
- [x] Session-aware landing navigation action for sign-in/registration
- [x] Alternating green/graphite and white public sections independent of device theme

## Decisions

1. **Signed-out navigation has separate Sign In and Register actions.**
   (Superseded the combined "Sign in / Register" link; see
   `specs/features/auth-access.md`.) Signed-out visitors see no Progress or
   bell; signed-in learners see Progress, the bell and Sign out.
2. **Signed-out status is "—".** Progress isn't saved for signed-out
   learners (attempt history lives only in page memory). Saving
   solved/attempted in the browser so they see a status too touches the
   practice page as well, so it gets its own spec.

## Changelog

- 2026-11-01 — created (draft, from design Option 2).
- 2026-11-01 — agreed; open questions resolved as proposed (see Decisions).
- 2026-11-01 — built; Shipped once merged to `main`.
- 2026-11-02 — superseded the static step-table presentation with the approved
  fixture-backed, user-controlled Landing Page tour; backend and Practice unchanged.
- 2026-11-04 — AC16: signed-in learners go from `/` to `/dashboard`, and the app
  logo links to `/dashboard`.
- 2026-11-02 — added the session-aware landing navigation action now that the
  combined sign-in and registration page exists.
- 2026-11-02 — corrected the public sequence to green, white, green, white, green.
- 2026-11-02 — header and problem catalog became auth-aware (separate Sign In / Register, locked rows); see `auth-access.md`.

## Landing motion (approved design restoration)

- AC16: Viewport entry reveals the narrative copy and visual, then its fixture
  code, array, pointers and explanation in order. Learning cards stagger in stage
  order; catalog heading and semantic rows reveal; closing content concludes in
  sequence. Reveals run once, with visible static content as the default fallback.
- AC17: Native anchors scroll smoothly with a 100px target margin, retaining hash
  URLs and browser history. Reduced motion uses instant scrolling and no reveals.
- The coordinator observes entry only (no scroll listeners), cancels on unmount
  or reduced-motion changes, and never controls execution or changes fixture data.
- Supported browsers additionally fade/translate the departing hero headline and
  draw a progression line above the learning cards using CSS view timelines.

- Preview sizing: switching Write, Run, Explore or Improve keeps the card height
  stable at each viewport width. The state panel scrolls internally when content
  exceeds its reserved height, including larger text settings and narrow screens.

- The hero’s “Explore the guided preview” link targets the next narrative heading
  (#narrative-title), landing with the heading 100px below the viewport top.

## Cursor and cinematic refinement (approved user brief, 2026-11-02)

- AC18: The landing page alone renders a transparent SVG arrow with white outline
  and rounded joins. Its tip tracks viewport pointer coordinates via one scheduled
  animation frame, without React state updates. A soft emerald spotlight follows
  on eligible surfaces, stronger on dark sections. Overlay never receives events.
- Text, code, fields and selection areas retain native cursors; interactive links
  and buttons use the outlined arrow. Leaving the page, coarse/touch input, reduced
  motion or unmount restores the native cursor. No overlay is required for use.
- First load: navigation (500ms), copy (700ms with 120–380ms delays), instrument
  (850ms after 450ms), supporting details (700ms after 650ms). Shared easing is
  cubic-bezier(.2,.7,.2,1). The original mark remains unchanged.
- Section reveal choreography uses the existing CSS module and one observer;
  reduced-motion changes restore visible content immediately. No execution states,
  palette changes, routing interception or new animation dependencies are added.

- Preview source wraps long lines within its code panel at every viewport width,
  preserving whitespace and source line numbers without horizontal scrolling.
