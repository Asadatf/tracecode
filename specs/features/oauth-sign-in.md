# Feature: Sign in with Google and GitHub

Status: Agreed by Asad (2026-11-03); needs Umair's agreement, as sign-in is his area (`auth-access.md`)
Owner: Asad
Related: `specs/features/auth-access.md`, `docs/rules/auth.md`

## Why

Creating a password is the biggest drop-off point before a learner writes any
code. Students already have Google and GitHub accounts, and every coding
platform offers them. One click to sign in means more learners reach the
practice page, and none of them has a password to forget.

## User stories

- As a new learner, I want to sign up with my Google or GitHub account, so
  that I can start practising without making a password.
- As a returning learner, I want to sign in the same way, so that I land back
  on my progress.

## Acceptance criteria

- **AC1** — GIVEN a provider is enabled WHEN a visitor opens `/login` or
  `/register` THEN they see "Continue with Google" and/or "Continue with
  GitHub" above the email form, separated by "or".
- **AC2** — GIVEN a provider is not enabled (its env flag is unset) THEN its
  button is not shown, and the email form works as today.
- **AC3** — GIVEN a visitor presses a provider button WHEN the provider
  approves THEN they return to `/api/auth/callback`, a session is created, their
  `users` row is provisioned exactly as for email sign-up, and they land on
  the page in `next` (if it is a safe, same-site path) or `/dashboard`.
- **AC4** — GIVEN the provider is cancelled or returns an error WHEN the
  visitor returns THEN they are on `/login` with "Sign-in with <Provider> was
  cancelled or failed. Try again or use email."
- **AC5** — GIVEN a learner who registered with email WHEN they later use a
  provider with the same verified email THEN they reach the same account
  (Supabase links identities by verified email), with their progress intact.
- **AC6** — GIVEN an unsafe `next` (another site, `//evil`, `javascript:`)
  WHEN the callback redirects THEN it goes to `/dashboard` instead (same rule
  as the existing email flow).

## Data / API

- Supabase Auth only (`signInWithOAuth` from the `startOAuthAction` form
  action, with `redirectTo` =
  `<NEXT_PUBLIC_APP_URL>/api/auth/callback?next=…&provider=…`); no application
  data through Supabase (`docs/rules/auth.md`). No new tables.
- New route handler `src/app/api/auth/callback/route.ts` (under `/api` so the
  locale middleware leaves it alone): exchanges the code for a session, calls
  `provisionUser`, redirects. Failures go to `/login?oauth_error=<provider>`.
- Server-only env flags `AUTH_GOOGLE_ENABLED` and `AUTH_GITHUB_ENABLED`
  (`"true"` to show the button), added to `src/lib/env.ts` and
  `.env.example`. Provider client IDs and secrets live only in the Supabase
  dashboard (hosted) or `supabase/config.toml` via `env()` (local), never in
  this repo.
- Analytics: none (the sign-in flow records none today).
- `docs/LOCAL_SETUP.md` gains a short "Google/GitHub sign-in (optional)"
  section.

## Edge cases

- Errors: AC4. Supabase unreachable: buttons still render; the callback shows
  the AC4 message.
- Unauthenticated / other users: identity always comes from Supabase's
  verified response, never the URL.
- A provider that returns no email (GitHub with a private email): Supabase
  requests the `user:email` scope; if there is still no email, sign-in fails
  with the AC4 message.

## Tasks

- [ ] Umair agrees the approach.
- [ ] Provider buttons on login and register; env flags.
- [ ] `/auth/callback` route + unit tests for the `next` rule and error path.
- [ ] Docs for setting up the two OAuth apps.
- [ ] Manual test with real OAuth apps (needs Asad's provider credentials).

## Changelog

- 2026-11-03 — created.
- 2026-11-03 — callback moved to `/api/auth/callback`; flags are server-only
  (`AUTH_*_ENABLED`); no analytics event.
