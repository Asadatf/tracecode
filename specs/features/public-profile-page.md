# Feature: Public learning profile

Status: Agreed (Umair, via the M9A.4 brief; no teammate sign-off)
Owner: Umair
Related: `specs/features/public-profile-settings.md`, `specs/features/activity-heatmap.md`,
`specs/features/streak.md`, `docs/rules/auth.md`

## Why

A learner who chooses to can share a page that shows their practice on TraceCode:
what they have solved and how consistently they practise, on a CV, a portfolio, GitHub or LinkedIn. The page shows recorded practice
activity. It does not claim to be a verified skill assessment.

## Acceptance criteria

- **AC1** — GIVEN `/u/<username>` for a profile that is `PUBLIC` with a valid
  username THEN the page renders. Any letter case resolves; a non-canonical address
  redirects to the lower-case one.
- **AC2** — GIVEN a username that is private, unset, malformed or nonexistent THEN the
  response is the same 404 for all of them, decided before anything about the account
  is read. A storage failure is a generic "can't load" page that does not echo the
  name.
- **AC3** — GIVEN a public profile THEN it shows: the username with the TraceCode
  identity; problems solved (of the catalogue total); qualifying practice runs
  (all-time, the streak's rule); current and longest streak; the M9A.2 contribution
  graph (the same component, 365 days); and a copy-link control. There is no topic
  breakdown.
- **AC4** — GIVEN the numbers THEN each is derived from the owner's saved data and
  nothing is estimated: solved counts distinct solved problems in the current
  catalogue; streaks are computed from the same days the graph shows; with no data
  every count is a real zero.
- **AC5** — GIVEN an owner with no solved problems and no runs THEN the page says they
  have not recorded any practice yet, beside a neutral graph and zero counts.
- **AC6** — GIVEN the statistics are loading THEN a skeleton with the same footprint is
  shown (no layout shift), announced as busy; the page header and identity appear
  first. GIVEN they cannot be read THEN the page says so and shows no numbers.
- **AC7** — GIVEN anyone viewing, signed in or not, THEN the data is the resolved
  owner's only: the public path never reads the session and never takes a user id
  from the request. It is read-only (no action, form or mutation).
- **AC8** — GIVEN the page and its data THEN nothing exposes email, internal ids,
  authentication details, submissions or code, per-run results or times, Tracy
  conversations, notification data, or private analytics.
- **AC9** — GIVEN the page head THEN it is noindex (a public profile means "anyone
  with the link", not search engines), with a canonical URL, Open Graph and Twitter
  card tags, and a share image that shows the username and three real numbers. For
  anything that is not a public profile the head and the image are generic and
  identical.
- **AC10** — GIVEN the page THEN it uses the app's tokens, has one `h1`, labelled
  sections, a description list for the statistics, reflows to two columns at 720px, and wraps long names.
- **AC11** — GIVEN the page THEN it follows the home page's design in two compact
  panels on the dashboard's soft grey-green: the signed-out home header (brand,
  section links back to home, Sign in, Register) whoever is looking, because the
  public path never reads the session; panel one with the username, a "TraceCode
  learner" subtitle, the address and a copy-link control on the left and the four
  statistics in a 2×2 grid on the right; panel two the contribution graph with its
  count and legend. There is no Practise button and no explainer paragraph under the
  graph or the page; the graph keeps its labels and tooltips.

## Data / API

- No schema change. `src/server/profile/public-profile.ts` (server-only, no session
  import, no write path): `resolvePublicProfile(username)` finds a `PUBLIC` owner via
  the M9A.3 lookup; `loadPublicProfileStats(owner)` reads that owner's progress rows
  (selected by field), activity days (shared loader, explicit id) and an all-time
  qualifying-run count. The pure `buildPublicProfileStats` returns a closed record.
- Route `src/app/[locale]/u/[username]/` (`page.tsx`, `opengraph-image.tsx`). The
  route is resolved before streaming so the 404 is a real 404; only the statistics
  stream behind the skeleton. `u` is a reserved username.
- No analytics events.

## Edge cases

- A profile made private stops resolving immediately; cached link previews elsewhere
  may linger outside our control.
- Runs are browser-reported (ADR-0001) and a learner can forge them, so the profile
  is not a verified assessment (the page carries no disclaimer line). Verified results arrive with M9B.
- A learner with more than 730 days of history shows streaks over the supported
  window; the run total is all-time.
- Before the M9A.2/M9A.3 migrations run, the owner lookup fails and the page is the
  generic "can't load" page; nothing is invented.

## Tests

`src/lib/profile/public-profile-*.test.mts`, `src/server/profile/public-profile.test.mts`,
`src/components/profile/public-profile.a11y.test.mts`.

## Changelog

- 2026-11-05 — created (Agreed).
- 2026-11-05 — two-panel layout; tagline kept as a subtitle; footnote, graph explainer and Practise button removed.
- 2026-11-05 — redesigned to follow the home page (header, hero, dark surface); topic
  coverage removed (AC3, AC11).
