# Feature: Keyboard shortcuts in the practice workspace

Status: In progress (built 2026-11-03; for Umair to review in the PR)
Owner: Asad
Related: `specs/features/practice-workspace-layout.md`

## Why

Learners run their code dozens of times per problem. Reaching for the mouse
each time breaks the write → run → read loop. LeetCode, VS Code and every
online judge use Ctrl/Cmd+Enter to run; meeting that habit makes the loop
faster and the workspace feel like a real tool.

## User stories

- As a learner, I want to run my code from the keyboard, so that I can keep my
  hands on the editor while I iterate.
- As a learner, I want to see which shortcuts exist, so that I can learn them.

## Acceptance criteria

- **AC1** — GIVEN the practice workspace is open and not busy WHEN the learner
  presses Ctrl+Enter (Cmd+Enter on macOS), from the editor or anywhere on the
  page THEN the tests run exactly as if Run code was clicked.
- **AC2** — GIVEN a run is already in progress WHEN the shortcut is pressed
  THEN nothing new starts (same as the disabled Run button).
- **AC3** — GIVEN the editor has focus WHEN the learner presses Shift+Alt+F
  (Shift+Option+F on macOS) THEN the code is formatted exactly as the Format
  code button does, including its toast.
- **AC4** — GIVEN focus is not in a text field WHEN the learner presses `?`
  THEN a small dialog lists every shortcut; Escape or its close button closes
  it and returns focus to where it was.
- **AC5** — GIVEN the Run and Format buttons WHEN hovered or focused THEN
  their tooltip names the shortcut (e.g. "Run code (⌘ Enter)").
- **AC6** — GIVEN the learner presses Enter alone in the editor THEN it still
  inserts a new line with auto-indent (shortcuts never steal plain keys).

## Data / API

- No server or database changes.
- `src/lib/trace/shortcuts.ts`: the shortcut table and a pure
  `matchShortcut(event, platform)` returning `'run' | 'format' | 'help' | null`,
  unit-tested for both platforms.
- Analytics: none in this slice.

## Edge cases

- macOS vs. others: detected from `navigator.platform`/`userAgentData`;
  both Ctrl and Cmd are accepted for Run on macOS, so external keyboards work.
- The `?` key inside the editor or a text field types a `?` (AC4 only fires
  outside text fields).
- Shortcut pressed while the tour dialog is open: ignored.

## Tasks

- [ ] `shortcuts.ts` + unit tests.
- [ ] Page-level key listener in the workspace; editor key handling for
      format; tooltip text.
- [ ] Shortcuts dialog (focus-trapped, Escape closes).
- [ ] e2e: Ctrl+Enter runs the tests.

## Changelog

- 2026-11-03 — created.
