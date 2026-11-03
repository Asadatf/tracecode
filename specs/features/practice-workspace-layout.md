# Feature: Practice workspace layout

Status: Agreed (user, 2026-11-03; no teammate sign-off)
Owner: Umair
Related: `fail-and-replay.md`, `dashboard-page.md` (AC17a), `auth-access.md`;
design review: the "Practice Workspace Proposal" page (2026-11-03)

## Why

Practising is a loop: write, run, explore a failure, improve. A fixed stack of
panels hides parts of that loop below the fold. A resizable workspace keeps the
challenge, the code and the results or replay on screen together, so the learner
can watch a failing test replay beside their own code.

## Scope

In: the layout of `/practice/<slug>`: a toolbar, a resizable three-pane
workspace, tabs, a stopwatch, a first-visit tour, a phone layout. Out: Python
execution, grading, hint logic, saved attempts, analytics, the trace contract.
No Editorial, Solutions, Submit, notes, ratings or companies.

## Acceptance criteria

- **AC1** — GIVEN a practice page at 768px or wider THEN it shows the challenge
  on the left, the code editor upper right and the results area lower right, with
  a toolbar above (the Write → Run → Explore →
  Improve strip, a stopwatch, a tour button). Run code lives only in the code
  pane header (AC8).
- **AC2** — GIVEN the left tabs THEN they are Description, Hints and History.
  Description opens with the problem title and difficulty, then the topics, the statement and the examples. Hints holds the existing teaching
  prompt and the post-solve challenge, or says why none is available yet; it
  shows a dot when one is ready. History is the existing attempts list.
- **AC3** — GIVEN the lower-right tabs THEN they are Test results and Replay.
  Replay shows the traced code and that step's variables side by side (stacked
  on a phone). A Run opens Test results; Replay on a test opens Replay.
- **AC4** — GIVEN a splitter WHEN dragged with a pointer THEN the panes resize
  and stop at the minimums: challenge 280px (20%–60% of the width), code 180px
  tall, results 120px tall. Defaults: challenge 20% of the width, code 45% of
  the right column.
- **AC5** — GIVEN a splitter WHEN focused THEN it is a `separator` with
  orientation, `aria-valuenow/min/max` and `aria-controls`; arrow keys move it
  16px (64px with Shift), Home and End jump to the limits, Enter toggles
  collapse, double-click resets it.
- **AC6** — GIVEN a pane WHEN its Collapse or Maximize button is used THEN the
  challenge and results panes collapse to a 44px rail or bar and the neighbours
  take the space; Maximize fills the workspace and Esc or the same button
  restores. Buttons have names and `aria-expanded`.
- **AC7** — GIVEN a layout change THEN sizes and collapsed state are remembered
  in a cookie read on the server, so the first paint is already right; blocked
  cookies fall back to the defaults.
- **AC8** — GIVEN the code pane header THEN it holds icon buttons for Reset code
  and Run beside Maximize, and a status line; there is no footer under the
  editor. GIVEN a Run THEN that status line reports each phase
  (Loading Python runtime…, Running tests…, "n / m passed", the existing error
  messages) in a polite live region, and Run is disabled while busy.
- **AC9** — GIVEN the stopwatch THEN it shows HH:MM:SS, starts and pauses with
  one button, resets with another, and never affects a run or what is saved.
- **AC10** — GIVEN a first visit THEN a five-step tour points at Run code, the
  tabs, the splitter, collapse and maximize, and Results to Replay; it can be
  skipped at any step, is not shown again, and the toolbar "?" starts it again.
- **AC11** — GIVEN a viewport below 768px THEN the splitters are replaced by a
  Problem / Code / Results switcher, one view at a time, with the Run button
  still in the toolbar, and the page has no horizontal scroll.
- **AC12** — GIVEN a keyboard user THEN every control has a visible focus ring,
  tabs follow the standard arrow-key pattern, and pane transitions respect
  reduced motion.
- **AC13** — GIVEN a signed-in learner THEN the workspace sits in the shell with
  the sidebar starting collapsed (dashboard-page AC17a); a guest on Two Sum gets
  the same workspace on the standalone page.
- **AC14** — GIVEN the code pane header THEN a Format code icon sits beside
  Reset and Run. It re-indents every block to four spaces, expands tabs, trims
  trailing spaces and trailing blank lines, moves each comment to the
  indentation of the code after it, keeps continuation lines (inside brackets
  or after a backslash) at their offset from the statement, and leaves lines
  inside triple-quoted strings untouched. It always reports the outcome in a
  toast: fixed, already right, or (code unchanged) the line whose indentation
  Python would reject, either dedented to a level no block uses or not indented
  after a colon.
- **AC15** — GIVEN the editor THEN a status bar under it shows the save state on
  the left (signed in: Not run yet, Edited since last run, Saved, Last run not
  saved yet; guest: This session only · sign in to save) and the caret's
  "Ln x, Col y" on the right. Only runs are saved; the editor text is not.

## Data / API

None. The layout cookie holds four numbers (`left,top,leftCollapsed,
resultsCollapsed`). The only change outside the page is that `ReplayView` can
be shown in two parts (trace and variables) with the step held by its parent.

## Edge cases

- No replay yet: Replay and Variables say how to start one.
- A saved layout below the minimums for a small window is clamped on drag, not
  rewritten.
- Maximized pane + Esc inside the editor: Esc only restores when focus is not in
  the editor, so Tab-escape behaviour is unchanged.
- Stopwatch runs only while the page is open; it is not saved.

## Tasks

- [ ] Layout math + tests, splitters, tabs, stopwatch, tour
- [ ] Regroup `practice-workspace.tsx` into the layout without touching its logic
- [ ] `ReplayView` parts, shared step
- [ ] Styles, phone view; spec status board row

## Changelog

- 2026-11-03 — Format code icon and editor status bar added (user).
- 2026-11-03 — toolbar Run code removed; Run is the code-header icon (user).
- 2026-11-03 — Replay and Variables merged into one Replay tab; Run and Reset
  moved into the code header as icons; defaults 20% / 45% (user).
- 2026-11-03 — created from the reviewed proposal; the toolbar carries the
  stopwatch (user addition), Variables is its own tab, no prev/next problem.
