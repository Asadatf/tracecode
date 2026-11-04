# Feature: Practice workspace layout

Status: Agreed (user, 2026-11-03; signed off by Asad 2026-11-04)
Owner: Umair
Related: `fail-and-replay.md`, `dashboard-page.md` (AC17a), `auth-access.md`,
`contextual-ai-tutor.md`;
design review: the "Practice Workspace Proposal" page (2026-11-03)

## Why

Practising is a loop: write, run, explore a failure, improve. A fixed stack of
panels hides parts of that loop below the fold. A resizable workspace keeps the
challenge, the code and the results or replay on screen together, so the learner
can watch a failing test replay beside their own code.

## Scope

In: the layout of `/practice/<slug>`: a toolbar, a resizable three-pane
workspace, tabs, a stopwatch, a layout reset, a first-visit tour, a phone layout,
and Tracy's panel (the AI Tutor; its behaviour is in `contextual-ai-tutor.md`).
Out: Python
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
  challenge pane collapses to a 44px rail, and the code pane (upward) and the
  results pane (downward) fold to a 44px header bar, never both at once, and
  the neighbours take the space; Maximize fills the workspace and Esc or the same button
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

### Tracy's panel (the AI Tutor)

A collapsible third panel. This section covers its place in the layout; what
Tracy says and how conversations work is in `contextual-ai-tutor.md`. The panel
wears the dashboard widget theme: near-black green with a glow in the middle and
soft corner glows, light-green accents and a soft halo (no ring lines), in all
three modes.

- **AC16** — GIVEN a practice page THEN the toolbar has an "Ask Tracy" button
  (`aria-pressed`, `aria-expanded`, `aria-controls`). The panel is closed by
  default on every visit; clicking the button opens and closes it. Opening it
  sends nothing to any service.
- **AC17** — GIVEN a viewport of 1100px or wider WHEN the panel opens THEN the
  workspace is three columns: Description on the left, the code editor above the
  results in the middle, and Tracy on the right spanning the full height of
  both. Tracy's width is 28% by default (20%–45%, at least 300px); the middle
  column always keeps 420px; the challenge column keeps its 280px minimum. A
  second splitter resizes Tracy (pointer, arrow keys with Shift for bigger
  steps, Home and End, double-click to reset); all existing splitters keep
  working. Tracy's width is saved with the layout cookie.
- **AC18** — GIVEN the panel opens and closes (any number of times) THEN the
  editor text, run results, status, replay step, tab choices, History, the
  conversation and the pane sizes are exactly as before; closed, the layout is
  the two-column layout at its previous sizes. The panel is never rendered into
  or over the editor.
- **AC19** — GIVEN the panel header THEN it has Close and Maximize / Restore
  buttons with names ("Close Tracy", "Maximize Tracy", "Restore Tracy size").
  Maximized (docked) it fills the whole workspace; Escape restores it first, then
  closes it. Maximized on a wide screen, the conversation and composer are capped
  at 960px and centred (the compact panel is unchanged).
- **AC20** — GIVEN the panel opens THEN focus moves to its "Tracy" heading;
  Escape or Close closes it and returns focus to the toolbar button. An
  information button beside the title opens the "How to ask Tracy (guide)" dialog
  (see `contextual-ai-tutor.md` AC16); Escape there closes only the guide.
- **AC21** — GIVEN the panel THEN its header reads "Tracy" with the subtitle "AI
  Tutor", and a context strip shows the current problem, its difficulty, its
  topics as neutral chips (from the catalog) and the latest run's summary, read
  from existing state. A guest sees a sign-in notice and a disabled composer; a
  signed-in learner sees the greeting "Hi, I'm Tracy!", suggested prompts that
  depend on the live state, the composer and the question counter. Nothing is
  sent until a question is sent.
- **AC22** — GIVEN a viewport of 768–1099px THEN the panel opens as a drawer over
  the workspace (about 420px, or full width when maximized) instead of squeezing
  the editor, behaves as a dialog (`role="dialog"`, `aria-modal`) and keeps Tab
  inside until it is closed.
- **AC23** — GIVEN a viewport below 768px THEN the panel opens as a full-screen
  dialog without the maximize button, and the page has no horizontal scroll.
- **AC24** — GIVEN the panel is open THEN every pane (challenge, code, results,
  Tracy's conversation) scrolls independently, transitions are 150ms and are
  removed under reduced motion, and the panel adds no animation of its own
  beyond the small typing indicator while a reply is awaited.

### Layout reset, problem switching and replay colors

- **AC25** — GIVEN the toolbar THEN a "Reset layout" button sits after the
  stopwatch and before the workspace-tour button. Pressing it returns the
  challenge, code, results and Tracy panes to their default sizes, expands any
  collapsed pane, un-maximizes, and rewrites the saved layout cookie to the
  defaults. It clears nothing else: the editor text, run results, replay step,
  History, the Tracy conversation and the stopwatch are untouched, and it asks no
  confirmation.
- **AC26** — GIVEN the problem picker WHEN the learner switches problem THEN the
  workspace is a fresh instance for that problem (editor, results, replay, Tracy
  conversation); nothing from the previous problem carries over.
- **AC27** — GIVEN the replay THEN it reuses one set of semantic colors
  (`semantic-tokens.css`): the loop label (purple, with a left rule and its "for"
  text), live variable names (blue) and recorded values (orange). They reuse the
  editor's syntax theme hues, have light-surface variants that meet 4.5:1
  contrast, are applied only where trace data fixes the role, and never carry
  meaning by color alone. The "changed this step" chip keeps its own amber state.
  The syntax theme, learner code and Tracy's prose are not recolored.

## Data / API

None. The layout cookie holds five numbers (`left,top,leftCollapsed,
resultsCollapsed,tutor`; older cookies without the fifth still load). Reset layout
writes the default values to it. The only change outside the page is that `ReplayView` can
be shown in two parts (trace and variables) with the step held by its parent.

## Edge cases

- No replay yet: Replay and Variables say how to start one.
- A saved layout below the minimums for a small window is clamped on drag, not
  rewritten.
- Maximized pane + Esc inside the editor: Esc only restores when focus is not in
  the editor, so Tab-escape behaviour is unchanged.
- Stopwatch runs only while the page is open; it is not saved.

## Tasks

- [x] Layout math + tests, splitters, tabs, stopwatch, tour
- [ ] Regroup `practice-workspace.tsx` into the layout without touching its logic
- [ ] `ReplayView` parts, shared step
- [ ] Styles, phone view; spec status board row

## Changelog

- 2026-11-04 — the panel became Tracy, a working tutor: AC16–AC24 rewritten from
  the preview (no more "Not connected" state), and AC25 (Reset layout), AC26
  (keyed workspace), AC27 (semantic replay colors) added (user).
- 2026-11-03 — code pane can fold upward to its header bar (user).
- 2026-11-03 — AI Tutor panel preview added: AC16–AC24 (user).
- 2026-11-03 — Format code icon and editor status bar added (user).
- 2026-11-03 — toolbar Run code removed; Run is the code-header icon (user).
- 2026-11-03 — Replay and Variables merged into one Replay tab; Run and Reset
  moved into the code header as icons; defaults 20% / 45% (user).
- 2026-11-03 — created from the reviewed proposal; the toolbar carries the
  stopwatch (user addition), Variables is its own tab, no prev/next problem.
