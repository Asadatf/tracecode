# Feature: Notes per problem

Status: Agreed (Asad, 2026-11-03; for Umair to review in the PR)
Owner: Asad
Related: `specs/01-architecture.md` (data model), `docs/rules/auth.md`, `docs/rules/database.md`

## Why

Writing down what you learned, in your own words, is one of the strongest ways
to make it stick, and it gives the learner something to reread before an
interview. LeetCode's per-problem notes are widely used for exactly this. A
short note per problem, saved to the learner's account, is a small addition
with real retention value, and later review features (M9) can show it.

## User stories

- As a signed-in learner, I want to keep a short note on each problem, so that
  I can record the trick and reread it later.

## Acceptance criteria

- **AC1** — GIVEN the practice workspace WHEN it opens THEN the challenge pane
  has a Notes tab.
- **AC2** — GIVEN a signed-out visitor WHEN they open Notes THEN it says "Sign
  in to keep notes on problems" with a sign-in link, and no text box.
- **AC3** — GIVEN a signed-in learner with a saved note WHEN they open Notes
  THEN the text box shows their note for this problem.
- **AC4** — GIVEN a signed-in learner types in the note WHEN they stop for
  800 ms (or leave the tab) THEN the note is saved, and the status reads
  "Saving…" then "Saved".
- **AC5** — GIVEN the save fails WHEN that happens THEN the status reads "Not
  saved. Retrying when you type again." and the text stays in the box.
- **AC6** — GIVEN a note is longer than 2 000 characters WHEN typing THEN the
  box stops at 2 000 and a counter shows "2000 / 2000".
- **AC7** — GIVEN the learner clears the note completely WHEN it saves THEN
  the stored note is deleted.
- **AC8** — GIVEN another learner's note WHEN any request tries to read or
  write it THEN it is refused: the server takes the user id from the session,
  never from the request.

## Data / API

- New Prisma model in `prisma/schema/learning.prisma`:
  `ProblemNote { userId Uuid, problemSlug String, body String, updatedAt
Timestamptz @updatedAt }`, primary key `(userId, problemSlug)`, cascade on
  user delete, `@@map("problem_notes")`. CI generates the migration; RLS is
  enabled (no policies) in a hand-written follow-up migration, as for every
  table.
- Server actions in `src/server/actions/notes.ts` through `validatedAction`:
  - `saveProblemNote({ problemSlug, body: string max 2000 })` →
    `{ saved: boolean }` (false when signed out); empty body deletes.
  - `problemSlug` must be a registry slug (Zod refine).
- Analytics: none in this slice (TraceCode records learning activity in its
  own tables, not the PostHog taxonomy).
- Reads happen on the server: `getProblemNote(slug)` in
  `src/server/learning/notes.ts` is called by the practice page, so the panel
  renders with the note (AC3) and no read action is exposed.
- `specs/01-architecture.md` data model gains the table.

## Edge cases

- Empty / first-time: an empty box with a placeholder ("What's the key idea?
  What tripped you up?").
- Errors: AC5. Supabase or the database not configured locally: Notes behaves
  as signed out.
- Another user's data: AC8.
- Limits: 2 000 characters (AC6); saves are debounced so typing doesn't spam
  the server.
- The note is plain text, shown as text, never as HTML.

## Tasks

- [ ] Schema + RLS migration; `01-architecture.md`.
- [ ] Actions + unit tests (validation, ownership, empty deletes).
- [ ] `notes-panel.tsx` with debounced save and status; wire as a left tab.
- [ ] e2e: signed-out state; signed-in save → reload → note kept.

## Changelog

- 2026-11-03 — created.
- 2026-11-03 — dropped the analytics event; the note is read on the server
  rather than through a read action.
