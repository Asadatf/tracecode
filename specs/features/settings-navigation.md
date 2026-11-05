# Feature: Settings and unified authenticated navigation

Status: In progress
Owner: Umair
Related: auth-access.md, progress-page.md, learning-recommendations.md

## Why

Give learners one calm navigation surface and a dedicated home for account
information. In-app learning reminders are always active for the hackathon release.

## User stories

- As a learner, I want consistent access to Practice, Progress, my inbox and Settings.
- As a learner, I receive daily suggestions and due-review reminders in the app without configuring notification settings.

## Acceptance criteria

- **AC1** — GIVEN a verified session WHEN Home, Progress or Settings renders THEN
  the same shared authenticated header shows the original mark and wordmark,
  Problems, Progress, the existing bell, a visible Sign Out button and an account button. Home also retains How it works and its dark header styling; app pages use the light variant. No Practice button. Current destinations
  expose aria-current. Guests retain separate Sign In and Register actions.
- **AC2** — GIVEN the account button WHEN opened by pointer or keyboard THEN the
  account email, Settings and Sign Out are available; Escape, outside click and
  selection close it. Keyboard focus returns to the trigger on Escape.
- **AC3** — GIVEN no session WHEN /settings is requested THEN the server redirects
  to /login?next=/settings before reading preferences. The page is noindex.
- **AC4** — GIVEN Settings WHEN rendered THEN Profile shows the verified account
  email read-only. Display-name editing is deferred by explicit user instruction
  on 2026-11-02: no name field, schema change or profile update action.
- **AC5** — GIVEN Settings in the hackathon release THEN no notification preference
  controls or reminder settings section are shown. In-app notifications are always
  active, including for learners with a previously saved in-app opt-out.
- **AC6** — GIVEN the hackathon release THEN reminders are in-app only and outgoing
  reminder email is disabled independently of configuration and existing opt-ins.
  Saved preferences are preserved for future releases; Auth emails are unchanged.
- **AC7** — GIVEN 1440, 1280, 768 or 390px width THEN navigation, dropdowns and
  forms remain usable without page overflow, with visible keyboard focus.

## Data / API

Protected /settings route using currentAccountSafe and the existing profile loaders.
No notification preference reads or controls in this release. Existing preference
actions and stored values are retained for future use. No schema or persistence changes.
Account initials derive from email until profile names are separately authorized.

## Edge cases

- A profile database failure shows an unavailable message.
- Missing email uses a neutral account initial.
- Long emails wrap in the menu and profile section.
- Retained preference actions stay session-scoped; no browser-supplied user ID.

## Tasks

- [ ] Shared header and accessible account dropdown
- [ ] Protected Settings and relocated preferences
- [ ] Tests and responsive review

## Changelog

- 2026-11-02 — implementation contract from the user's explicit milestone brief;
  display-name work explicitly deferred by subsequent instruction.

- 2026-11-02 — user clarified context-specific links/styles and directly visible Sign Out; Home retains How it works and Problems.
- 2026-11-03 — user decision: `/settings` renders inside the dashboard's `AppShell`
  (sidebar, search, bell, account menu; no right widget) instead of the
  `ApplicationHeader` in AC1. Home and Progress keep their headers until the
  user asks to move them. See `dashboard-page.md` AC17.
