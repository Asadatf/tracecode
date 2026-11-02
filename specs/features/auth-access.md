# Feature: Authentication navigation, access control, Sign In and Registration

Status: In progress
Owner: Umair
Related: `specs/00-product.md`, `specs/features/home-page.md`,
`specs/features/progress-page.md`, `DESIGN_DECISIONS.md` (Q13 split-screen auth),
`docs/rules/auth.md`

## Why

The combined `/login` card hides that an account is optional for one problem
and required for the rest. Visitors should be able to try Two Sum immediately,
see the full catalog, and meet a clear Sign In / Register choice — in a design
that matches the approved Landing Page. The Supabase Auth backend is unchanged.

## User stories

- As a visitor, I want to try Two Sum without an account, so I can judge the
  product first.
- As a visitor, I want to see the other five problems and know they need an
  account, so I'm not surprised by a redirect.
- As a learner, I want to sign in or register on a dedicated page and land back
  where I was heading.

## Acceptance criteria

- **AC1** — GIVEN a signed-out visitor WHEN the Landing Page renders THEN the
  header shows How it works, Problems, a secondary Sign In link (`/login`) and a
  primary Register link (`/register`), and no Progress link, notification bell
  or account menu.
- **AC2** — GIVEN a signed-in learner WHEN the Landing Page renders THEN the
  header shows How it works, Problems, Progress, the notification bell, the
  account chip with Sign out, and no Sign In / Register links. The state is
  resolved on the server (`currentUserIdSafe`); there is no client flash.
- **AC3** — GIVEN a signed-out visitor WHEN they open `/practice/two-sum` THEN
  the workspace works as before (Run, tests, hints, replay) and saves nothing.
- **AC4** — GIVEN a signed-out visitor WHEN they request any other practice
  problem or `/progress` THEN they are redirected to `/login?next=<that path>`.
- **AC5** — GIVEN a signed-out visitor WHEN they view the problem catalog THEN
  Two Sum links to practice; the other five show a lock and "Sign in to unlock"
  and link to `/login?next=/practice/<slug>`. Problem data is unchanged.
- **AC6** — GIVEN `/login` and `/register` WHEN opened THEN each renders its own
  form (Sign In: email, password, show/hide; Register: email, password, confirm
  password, show/hide, requirements) with a link to the other that keeps `next`.
- **AC7** — GIVEN the Register form WHEN password and confirmation differ, or the
  password is outside 8–72 characters, THEN the form shows the error without
  calling the server.
- **AC8** — GIVEN a successful sign-in/sign-up that yields a session WHEN the
  action finishes THEN the learner is redirected to the sanitised `next`, or
  `/progress` when absent or unsafe.
- **AC9** — `next` is accepted only if it is a same-origin absolute path that is
  not `//…`, contains no backslash or control characters, and does not point at
  `/login` or `/register`; anything else falls back to `/progress`.
- **AC10** — GIVEN a signed-in learner WHEN they open `/login` or `/register`
  THEN they are redirected to the sanitised `next` (no redirect loop).
- **AC11** — GIVEN reduced motion or a phone-width viewport THEN the visual panel
  is static or hidden, the form comes first, and nothing scrolls horizontally.
- **AC12** — GIVEN a device that prefers either light or dark mode WHEN `/login`
  or `/register` renders THEN the form panel and fields remain neutral white on
  the approved light-first canvas; emerald is reserved for actions and state,
  while only the cinematic execution panel uses the graphite treatment.

- **AC13** — Opening either auth page reveals the form card over 700ms, with
  heading, description, form and switch link staggered over 120–380ms. On desktop
  the visual panel fades in over 900ms; its caption, heading and instrument enter
  with 180–360ms delays. Entrances run once per page opening using opacity and
  transform, preserve layout and field operation, and are disabled for reduced
  motion. The original logo stays static and mobile retains the form-only layout.

## Data / API

- No schema, migration or Supabase configuration change.
- `authenticateAction` (`src/server/actions/auth.ts`) is reused for both forms;
  it gains an optional `next` field, sanitised server-side by
  `safeReturnTo` (`src/lib/auth/return-to.ts`). Mode, credential validation,
  error mapping, provisioning and email-confirmation notice are untouched.
- Enforcement points: `practice/[slug]/page.tsx` and `progress/page.tsx`
  (server redirects using `currentUserIdSafe`); persistence/notification/
  recommendation actions already return unauthenticated results or no data
  without a verified session and take the user id from the session only.

## Edge cases

- Supabase unconfigured or unreachable: treated as signed out. Two Sum still
  works; restricted routes redirect to `/login`, which still renders.
- Email confirmation on: sign-up returns a notice, not a session; no auto
  sign-in. The confirmation link target is Supabase-project configuration.
- Password recovery is not implemented, so no "forgot password" link exists.
- No Google OAuth.
- Settings does not exist yet; the account chip offers Sign out only.

## Tasks

- [x] This spec; home-page and progress-page specs amended
- [x] `safeReturnTo`, guest-access list, header-nav model + unit tests
- [x] Auth-aware landing header; locked catalog rows
- [x] Server redirects on restricted practice slugs and `/progress`
- [x] `/login` and `/register` split-screen pages
- [x] Playwright coverage; existing guest specs updated
- [x] Light-first auth surfaces independent of the device color preference

## Changelog

- 2026-11-02 — created and built.
- 2026-11-02 — scoped the auth presentation to the approved light-first palette.
