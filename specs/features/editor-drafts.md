# Feature: Keep my code (editor drafts)

Status: In progress (built 2026-11-03; for Umair to review in the PR)
Owner: Asad
Related: `specs/features/practice-workspace-layout.md`, `specs/features/fail-and-replay.md`

## Why

Today the editor's code lives only in React state: a refresh, a closed tab or
opening another problem throws away whatever the learner was typing. Losing
work punishes exactly the behaviour we want (trying, leaving, coming back), and
every LeetCode-style site keeps your code. Keeping a draft per problem in the
browser removes that friction for signed-in and signed-out learners alike.

## User stories

- As a learner, I want my code to still be there when I come back to a
  problem, so that a refresh or a closed tab never costs me my work.
- As a learner, I want an obvious way to start over from the starter code, so
  that a saved draft never traps me.

## Acceptance criteria

- **AC1** — GIVEN a learner edits the code on a problem WHEN they reload the
  page (or leave and reopen it) THEN the editor shows their last edit, not the
  starter code.
- **AC2** — GIVEN a draft was restored WHEN the workspace opens THEN the code
  footer says "Restored your last edit", so the learner knows it isn't the
  starter.
- **AC3** — GIVEN a draft exists WHEN the learner presses Reset code THEN the
  editor shows the starter code and the draft for that problem is deleted.
- **AC4** — GIVEN drafts on two problems WHEN the learner switches between
  them THEN each problem shows its own draft.
- **AC5** — GIVEN the code equals the starter code WHEN it would be saved THEN
  no draft is stored (an untouched problem stays untouched).
- **AC6** — GIVEN browser storage is unavailable (private mode, blocked, full)
  WHEN the learner types or opens a problem THEN the workspace works exactly
  as today, with no error shown.

## Data / API

- No server, database or analytics changes. Drafts live in `localStorage`
  under `tracecode:draft:v1:<slug>` as `{ code: string, savedAt: ISO string }`,
  validated with Zod on read (anything that fails to parse is ignored and
  removed).
- Writes are debounced (500 ms after the last keystroke) and also flushed on
  `pagehide`.
- Pure helpers in `src/lib/trace/editor-drafts.ts` (`readDraft`,
  `writeDraft`, `clearDraft`), taking a `Storage`-like object so they unit-test
  without a browser.

## Edge cases

- Empty / first-time state: no draft → starter code, no footer note.
- Errors: a throwing `localStorage` (Safari private mode) is caught; nothing
  is saved, nothing breaks (AC6).
- Unauthenticated or another user's data: drafts are per browser, not per
  account. A shared computer shares drafts; this is the same trade-off every
  browser-side editor makes and is noted in the UI copy nowhere (too minor).
- Limits: a draft over 100 000 characters is not saved (the largest real
  solution is a few hundred characters); the editor keeps working.
- A problem whose starter changes later: the draft still wins; Reset gets the
  new starter.
- "Load code" from History or "Restore my solved code" replaces the editor
  and therefore the draft, like any other edit.

## Tasks

- [ ] `editor-drafts.ts` + unit tests (read/write/clear, invalid JSON,
      throwing storage, size cap, starter not stored).
- [ ] Wire into `practice-workspace.tsx`: initial code from the draft,
      debounced save, Reset clears, footer note.
- [ ] e2e: edit → reload → code kept; Reset → starter.

## Changelog

- 2026-11-03 — created.
