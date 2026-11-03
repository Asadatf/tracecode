# Feature: Solutions tab

Status: Agreed (Asad, 2026-11-03; for Umair to review in the PR)
Owner: Asad
Related: `specs/features/curated-problem-pack.md`, `specs/features/practice-workspace-layout.md`,
`specs/02-trace-contract.md`, `src/lib/trace/reference-solutions.ts`

## Why

Today a learner who passes reaches a dead end: the optional challenge hints
that a better approach exists but never shows one. Seeing a good solution after
an honest attempt is how most people learn on LeetCode (its Editorial). TraceCode
can do better than a static write-up: each approach plays in the same
step-by-step replay the learner already knows, and their own passing code is
compared with the faster approach on the same input, in steps rather than a
noisy runtime percentile.

## User stories

- As a learner who has solved a problem, I want to see the simple and the
  optimised approach with their complexity, so that I learn the better way.
- As a learner, I want to watch an approach run step by step, so that I see
  _why_ it is faster instead of reading "O(n)".
- As a learner, I want to know how much work my solution did compared with
  the optimised one, so that I know whether it is worth improving.
- As a stuck learner, I want to be able to reveal the solutions after trying,
  so that I am not blocked forever.

## Acceptance criteria

- **AC1** — GIVEN the practice workspace WHEN it opens THEN the challenge pane
  has a Solutions tab after History.
- **AC2** — GIVEN the learner has not solved the problem in this session and
  has fewer than 3 failed runs WHEN they open Solutions THEN it is locked and
  says what unlocks it ("Pass all tests, or make 3 attempts").
- **AC3** — GIVEN 3 or more failed runs and no pass WHEN they open Solutions
  THEN they see a "Show solutions anyway" button; pressing it unlocks the tab
  for this problem in this session.
- **AC4** — GIVEN any run passed every test WHEN they open Solutions THEN it is
  unlocked without asking.
- **AC5** — GIVEN an unlocked Solutions tab THEN it lists every reference
  solution with `passes: true` for the problem, straightforward first, each
  with its name, time and space complexity, a plain-English explanation of
  2–4 sentences, and its code (read-only, highlighted like the editor).
- **AC6** — GIVEN an approach WHEN the learner presses "Watch it run" THEN the
  results pane switches to Replay and shows that approach traced on the
  problem's first example, labelled with the approach's name.
- **AC7** — GIVEN the learner has a passing run in this session WHEN they press
  Compare under "Your solution vs. the optimised one" THEN both their latest
  passing code and the optimised approach are traced on the problem's
  comparison input, and each one's step count is shown as a bar, plus one
  sentence on what the numbers mean. A new passing run makes the result stale
  and shows the Compare button again.
- **AC8** — GIVEN a trace that hit the step cap (2 000) WHEN step counts are
  shown THEN that side reads "more than 2,000 steps" rather than a wrong
  number.
- **AC9** — GIVEN the engine fails or times out while tracing for AC6 or AC7
  WHEN that happens THEN the panel shows a short error and the rest of the tab
  still works.
- **AC10** — GIVEN every problem in the registry THEN it has at least one
  straightforward and one optimised passing reference solution with an
  explanation, and each passes all of that problem's tests in the real engine
  (enforced by tests, so a new problem without solutions fails CI).

## Data / API

- `ReferenceSolution` (in `src/lib/trace/reference-solutions.ts`) gains a
  required `explanation: string` field. Its header comment changes from
  "never shown to learners" to "shown in the Solutions tab". This is
  Umair's file: the change is additive and his measurement tests keep running
  unchanged.
- Reference solutions are added for `two-sum` and `contains-duplicate`, which
  have none today.
- A per-problem `comparisonArgs: Json[]` (in the same file): an input big
  enough to show the difference but small enough that the straightforward
  approach stays under the 2 000-step cap where possible.
- The replay's `ReplayState.kind` gains `'solution'`, so the replay pane can
  label it. The trace contract itself does not change.
- No server, database or analytics changes in this slice.

## Edge cases

- Empty / first-time state: the locked view (AC2).
- Errors and timeouts: AC9. A learner whose passing code is itself very slow
  hits the cap and reads "more than 2,000 steps" (AC8).
- Unauthenticated: same behaviour; unlock state is per session, not saved.
- Limits: solutions render without a trace until "Watch it run" is pressed, so
  opening the tab costs no engine time. AC7's two traces run once per pass and
  are cached until the next run.
- Problems where the optimised approach is not faster in steps (e.g. Move
  Zeroes, where both are O(n) and only space differs): the explanation says
  what is better (space), and the comparison sentence says the step counts are
  similar.

## Tasks

- [ ] Add `explanation` to every reference solution; add two-sum and
      contains-duplicate solutions; add `comparisonArgs`.
- [ ] Test: every registry problem has both kinds with explanations (AC10);
      every `passes: true` solution passes its tests in the engine.
- [ ] `solutions-panel.tsx` (locked, unlocked, comparison), wired as the
      fourth left tab; `'solution'` replay kind.
- [ ] Unit tests for the unlock rule; e2e: pass → Solutions → Watch it run.

## Changelog

- 2026-11-03 — created.
- 2026-11-03 — AC7: the comparison runs on a Compare button rather than on
  opening the tab, so opening Solutions never costs engine time.
