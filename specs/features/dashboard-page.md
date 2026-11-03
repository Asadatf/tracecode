# Feature: Learner dashboard (`/dashboard`)

Status: Agreed (user, 2026-11-03; no teammate sign-off)
Owner: Umair
Related: `specs/00-product.md` § How users see progress, `progress-page.md`,
`settings-navigation.md`, `auth-access.md`, `home-page.md` (visual theme)

## Why

A learner who returns to TraceCode wants one calm place that answers "where am
I, and what did I just do?" without reading a full table page. The dashboard
puts the recent runs and per-topic coverage side by side inside a persistent
app shell (sidebar, search, inbox, account), so the next problem is one click
away. It reuses the landing page's light theme so the product reads as one
surface. It shows only what the app already records.

## Scope (80/20 slice)

In: app shell (collapsible sidebar, top bar with search, bell and account
menu), Progress, Explore problems, By topic, a three-number summary strip.
Out (follow-ups, not in this spec): moving Progress, Settings or Practice into
the new shell (the user will ask for that separately); the problem table;
drag/resize panels; any new stored data. `/progress` and `/practice/*` are not
touched by this change.

## User stories

- As a signed-in learner, I want to see my latest runs and their results, so
  that I can tell whether I'm getting closer.
- As a signed-in learner, I want solved/total per topic always in view, so
  that I know which topic to practise next.
- As a learner, I want to search the problems and jump straight to one.
- As a learner, I want to collapse the sidebar to icons, so that content gets
  the room.

## Acceptance criteria

- **AC1** — GIVEN no session WHEN `/dashboard` is requested THEN the server
  redirects to `/login?next=/dashboard` before any progress loader runs. The
  page is `noindex`.
- **AC2** — GIVEN a verified session WHEN `/dashboard` renders THEN it shows
  a sidebar, a top bar and two content regions: the Progress and Explore cards (centre) and By
  topic (right), using the landing page's light tokens (no dark theme, no new
  palette).
- **AC3** — GIVEN the sidebar WHEN rendered THEN it lists Overview
  (`/dashboard`, `aria-current="page"`) and Problems (`/problems`) at the top,
  each with an icon from `@/components/ui/icons`. There is no Progress entry: the
  `/progress` route, its analytics, recommendations and notification links still
  exist, they are just no longer in the sidebar. Settings (`/settings`) sits in an
  Account group at the bottom, with an icon-only sign-out button (the existing
  `signOutAction`, labelled "Sign out") at the far right of the same row. The
  brand mark links to `/`.
- **AC4** — GIVEN the sidebar toggle WHEN activated by pointer or keyboard
  THEN the sidebar collapses to an icon-only rail (icons stay, labels become
  visually hidden but remain the accessible name, plus a tooltip on hover and
  focus) and expands again. The toggle has `aria-expanded` and an accessible
  name. The choice persists per browser in a cookie that the server reads, so the
  first paint is already the right width (no expanded-then-collapsed flash on a
  page load or between pages); with cookies blocked it defaults to expanded.
- **AC5** — GIVEN the summary strip WHEN rendered THEN it shows Solved (`n of
total`), Attempted and Runs from `buildProgressView(...).summary`. No value
  is invented.
- **AC6** — GIVEN the centre column THEN, under the summary strip (AC5), it shows
  two cards in this order: Progress and Explore problems (AC25–AC28). There is no
  list of repeated submissions on the Overview.
- **AC7** — GIVEN By topic WHEN rendered THEN each topic shows `solved/total`
  from `view.topics` with a proportional bar whose width is `solved/total`,
  and `role="img"`-free semantics: the text value is the source of truth, the
  bar is decorative (`aria-hidden`).
- **AC8** — GIVEN a viewport of 1024px or wider WHEN the page scrolls THEN the
  centre and right columns scroll independently inside the shell, the By topic
  panel stays in view (sticky) with a subtle floating treatment (soft shadow
  and glow; one smooth lift-and-settle when the cursor
  enters it, a brighter glow and shifted rings while it is hovered, and no
  replay while it stays or when it leaves), and the scrollbars are thin and low-contrast.
  The lift is disabled under `prefers-reduced-motion: reduce`.
- **AC9** — GIVEN a viewport below 1024px THEN there is no sticky panel and no
  hover lift: the layout is a single column (summary, Progress, Explore problems, then the By topic widget); the
  sidebar becomes an off-canvas drawer opened from a menu button in the top
  bar (focus trapped while open, Escape and outside click close it, focus
  returns to the button); the page itself scrolls, with no horizontal
  overflow at 390px.
- **AC10** — GIVEN the search box WHEN the learner types THEN a results list
  filters the problem catalogue by title and topic (client-side, from the
  already-bundled `PROBLEMS`), is operable with Arrow keys, Enter and Escape,
  and selecting a result goes to `/practice/<slug>`. No match shows "No
  problems match". No network request is made.
- **AC11** — GIVEN the bell WHEN activated THEN the existing notification inbox
  opens in a card-style panel: a heading with an "N new" pill, a subheading, a
  settings button linking to `/settings`, All and Unread (n) filters, Mark all
  read, and one card per notification with an icon, title, body, relative time
  ("12 min. ago"), a link button and Mark read, unread cards tinted with a dot.
  Data, actions and the unread count are the existing M7.5B ones; no second
  inbox is added. The panel is shared by every header that renders the bell.
- **AC12** — GIVEN the top bar THEN it has no account button or menu: the
  search box on the left and the notification bell at the far right. Settings
  and Sign out live at the bottom of the sidebar (AC3).
- **AC13** — GIVEN a learner with no attempts THEN Progress says they haven't attempted
  a problem yet, Explore problems lists every problem, and By
  topic still lists every topic as `0/n`.
- **AC14** — GIVEN saved progress that can't be read THEN the content region
  shows the same unavailable message as `/progress`, with the shell still
  usable. No placeholder numbers.
- **AC15** — GIVEN a keyboard user THEN every control has a visible focus ring
  and the tab order is sidebar, top bar, Progress, Explore problems, By
  topic.
- **AC16** — GIVEN a successful sign-in or registration with no explicit `next`
  WHEN the learner is redirected THEN they land on `/dashboard`
  (`DEFAULT_RETURN_TO` changes from `/progress`; an explicit safe `next` still
  wins). `auth-access.md` is updated in the same PR.
- **AC17** — GIVEN the shell WHEN a page adopts it THEN it does so by wrapping
  its content in one shared `AppShell` (sidebar, top bar, theme tokens) that
  lives outside the dashboard route and takes the current nav item as a prop,
  so later pages follow the dashboard's theme by adopting it. The dashboard is
  the first consumer; no dashboard-specific markup lives in the shell.
- **AC17a** — GIVEN a signed-in learner WHEN they open `/practice/<slug>` THEN the
  existing workspace renders unchanged inside the shell (sidebar only: no search box, no bell, no right widget, no sidebar item
  highlighted; the sidebar starts collapsed to the icon rail whatever was saved,
  and toggling it there is not remembered; the content starts near the top and
  is left-aligned), without the workspace's
  own top strip (brand, problem picker, Progress link), which the shell replaces. A guest on Two Sum keeps
  the standalone page, because the shell is account-only.
- **AC18** — GIVEN the sidebar WHEN expanded THEN it is 232px wide (collapsed
  68px), set by one CSS token so it can be tuned. The sidebar (and the mobile
  drawer) use the same dark landing-hero green as the right-hand card, with its
  glow and faint corner rings; the current item is a light-green pill.
- **AC19** — GIVEN a learner with progress THEN the right column is one
  floating card (same hover lift) in one dark-green theme, with a single gradient
  behind both parts so it reads as one surface: the "Coverage by topic" section
  on top and the "What to practise next" section below it. The lower section has no visible heading (an
  `sr-only` "What to practise next" keeps the region labelled) and shows one card with a lightbulb and
  "Your learning insight", a one-line summary, "UP NEXT", the problem title and
  its topic chips and a Start/Continue/Open problem button, with a refresh icon
  at the right of the header (an AI-written summary also shows a small "AI"
  tag). Every refresh outcome (refreshed, already up to date, cooldown, already
  running, failed) shows as a toast at the bottom right, e.g. "Couldn’t refresh
  the AI insight right now — showing your latest." for a failure. The card has a soft green glow behind it and faint concentric guide
  rings like the landing hero. When the engine's summary is
  "You solved <slug> after some earlier unsuccessful attempts", it reads
  "You've solved <topic and topic> problems after earlier attempts. Ready for a
  new challenge?" (at most two topics); any other summary, including an AI one,
  shows unchanged. Data and the refresh action are the existing M7.5 ones;
  a refresh updates the whole section. `/progress` keeps its own card. If the
  column is taller than the window it scrolls inside itself with no visible
  scrollbar.
- **AC20** — GIVEN an avatar (account button, and wherever one is shown) THEN a
  shared `Avatar` renders a photo when an image URL is supplied and falls back
  to initials otherwise. No avatar image is stored today, so initials show until
  a source exists; no stock photo is bundled as a stand-in for the learner.
- **AC25** — GIVEN the Progress card THEN it lists up to five distinct problems
  the learner has attempted, most recently attempted first (solved and in progress
  alike), one row per problem with its title, topics, a Solved or In progress
  status and its attempt count, all from their persisted progress. The title (the
  row) opens the shared problem-detail modal (AC26). Beside it, Continue
  (attempted, unsolved) or Reattempt (solved) links to the real
  `/practice/<slug>` page. No attempt record is changed, removed or
  de-duplicated; attempts are only grouped by problem here.
- **AC26** — GIVEN the problem-detail modal THEN it is the one modal also used by
  the Problems table (problems-page AC15): a compact dialog opened from a title
  and closed by the Close button, Escape or a click outside it, with focus kept
  inside while open and returned to the title that opened it. It shows only the
  problem title and difficulty, topics, status (Solved, In progress or Not
  started), total attempts, best test result, first attempted, last attempted and,
  for a solved problem, first solved and last solved, plus the Practice action (Reattempt,
  Continue or Start). There is no attempt list, no insight and nothing is
  fetched; a value that does not exist yet (a never-attempted problem) shows a
  dash, never an invented one.
- **AC27** — GIVEN the first-attempted date THEN it is the earliest attempt the
  learner has saved for that problem, read once per page load as a single
  read-only aggregate scoped to the signed-in learner (one row per problem; no
  source, results or replay data). If it cannot be read the modal shows a dash.
- **AC28** — GIVEN Explore problems THEN it lists the problems the learner has
  never attempted (up to 20), five rows visible and the rest scrolling, each with
  its topics and, beside the Start link to its practice page, a difficulty pill
  (green easy, orange medium, red hard, also used in the modal), following the
  order of the right-hand panel's recommendation ranking (the catalogue order
  without one), including the problem that panel recommends so every
  problem the learner has not started is accounted for. "View all problems" links to `/problems`. Below 520px the summary
  metrics stay three across and the cards stack with no horizontal overflow.

## Data / API

- No Prisma or schema changes. The progress rows gain `lastAttemptAt` (the existing `updatedAt`, which only
  `saveAttempt` writes) and one read-only aggregate, `getFirstAttemptDates`,
  gives each problem's first attempt (AC27). Reads `getLearningProgress()` and
  `buildProgressView()` only (same loaders as `/progress`), plus
  `currentAccountSafe()` and the existing `NotificationBellSlot`.
- `specs/01-architecture.md` needs no edit (no model or API change).
- Reuses `account-initials.ts` and the `AccountMenu` pattern from
  `settings-navigation.md`; the sidebar and search are new client components.
- Analytics: no new events; the existing automatic `page_viewed` covers the page.
  (The taxonomy has no page-specific events, and none are added.)

## Edge cases

- Empty / first-time: AC13. No fabricated runs, bars or counts.
- Errors: loader failure → AC14; cookies blocked → default expanded.
- Unauthenticated or another user's data: AC1; loaders read the session, never
  a browser-supplied user id.
- Long titles and topic names wrap or truncate with a `title`, no overflow.
- Many topics: By topic scrolls inside its panel (AC8) rather than growing the
  page.
- A problem no longer in the catalogue never appears in Progress or Explore,
  not a broken link.
- Limits: Progress shows five problems; Explore shows five rows then scrolls, at
  most 20 rows.
- Locale: all copy in the `Dashboard` messages namespace; links via
  `@/i18n/routing`.

## Decisions (2026-11-03, from the user)

1. `/dashboard` is the first page after login; `/progress` stays as is for now.
2. The sidebar shell is universal, but `/progress` and `/practice` are not moved
   until the user asks. It is built so they can adopt it later (AC17).
3. No separate Profile entry (2026-11-03): the account menu offers Settings and
   Sign Out only; Settings holds the read-only profile.
4. Photo avatars are acceptable; the recommendation card is included (AC19).
   Open: where photo avatars come from (no avatar field exists, AC20). Needs a
   decision before any upload or provider-photo work, out of scope here.

## Tasks

- [ ] Change `DEFAULT_RETURN_TO` to `/dashboard`; update `auth-access.md` and its tests
- [ ] Shared `AppShell` and `Avatar` outside the dashboard route
- [ ] `/dashboard` route, auth redirect, noindex, `Dashboard` messages
- [ ] App shell: collapsible sidebar, drawer on mobile, top bar
- [ ] Problem search (client-side combobox)
- [ ] Progress, Explore problems and By topic panels, sticky card, hover lift and scrollbars
- [ ] Wire bell and account dropdown
- [ ] Unit tests (view mapping, search filter) and e2e for AC1, AC4, AC9, AC10,
      AC12, AC16

## Changelog

- 2026-11-03 — created (Draft).
- 2026-11-03 — centre column reorganised: "Progress" (one row per attempted
  problem, with a detail modal) and "Explore problems" replace the Recent runs
  table (AC6, AC25–AC28; user).
- 2026-11-03 — Progress removed from the sidebar (AC3); the card is titled
  Progress, shows five problems, and the modal drops attempt history for compact
  facts (AC25–AC27; user).
- 2026-11-03 — open questions answered; added post-login redirect, shared shell,
  sidebar width, recommendation card and avatar ACs.
