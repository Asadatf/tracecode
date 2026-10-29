# TraceCode — product spec

Status: **DRAFT — scope not yet agreed.** Items marked _(open)_ need a team
decision before this spec is finalised. Owner: Team D, 8x Playmakers
("Learning that sticks", Coding track).

## Problem

Coding-practice platforms tell you _that_ your solution failed ("expected
`[1, 2]`, got `[2, 1]`") but not _why_. Learners then guess-and-resubmit
until something passes, which builds no understanding: the bug in their
mental model of the program is still there, and so is the next bug it
causes. A pass reached that way doesn't stick.

## Users

- **Primary: early-to-intermediate learners** practising fundamentals
  (loops, conditionals, arrays, two-pointer, simple recursion) who can
  write code but can't yet reliably simulate it in their head.
- **Secondary (post-v1):** instructors/bootcamps who want to see where a
  cohort's mental models break.

## Core loop

1. **Pick a problem** — short statement, starter code, visible example
   tests.
2. **Write and run** — the solution runs against the problem's tests.
3. **On failure: trace replay.** The learner picks the failing test and
   steps through its execution: current line highlighted, variables and
   their values per step, loop iteration counters, and array
   indices/pointers drawn against the array. Forward, back, and scrub.
   The step where actual state diverges from expected (where the problem
   provides that) is marked.
4. **Progressive hints.** Up to three levels, each revealed on request:
   (1) _where_ to look (a line or step range), (2) _what_ is wrong
   conceptually, (3) a concrete nudge short of the answer. Hint use is
   recorded.
5. **Fix and resubmit** — back to step 2.
6. **On pass: block rebuild.** The learner's own passing solution is
   split into blocks (lines/statements), shuffled, and rebuilt in order
   (Parsons-problem style) to consolidate the structure. Rebuild completion
   counts toward mastery.

## First milestone: demo slice

One complete flow, end to end, before anything else: solve a Python
problem (**Two Sum**), get a failing test, and step through its execution
to see why it failed. Spec: [`specs/features/fail-and-replay.md`](features/fail-and-replay.md).
Hints, block rebuild, accounts-backed progress follow once it works.

The engine (execution/tracing) and the visualiser are built in parallel
against one contract: [`specs/02-trace-contract.md`](02-trace-contract.md).

## v1 scope (proposed)

| In                                          | Notes                                                              |
| ------------------------------------------- | ------------------------------------------------------------------ |
| Sign up / sign in (Supabase Auth)           | Already wired by the template                                      |
| Problem list + problem page with editor     | ~10–15 curated problems, seeded, no authoring UI                   |
| Run against tests, show pass/fail per test  |                                                                    |
| Step-by-step trace replay of a failing test | Variables, loop iterations, array index pointers                   |
| Progressive hints, 3 levels                 | _(open)_ hand-authored per problem vs. AI-generated from the trace |
| Block rebuild after pass                    | Reorder-only; no distractor blocks in v1 _(open)_                  |
| Progress page                               | See "How users see progress"                                       |
| **One language** _(open)_ — Python proposed | See `specs/01-architecture.md`                                     |

## Out of scope for v1

- More than one language.
- Problem authoring UI, user-submitted problems.
- Instructor/cohort dashboards, classrooms, teams.
- Competitive features: leaderboards, contests, timed rounds.
- Payments/subscriptions.
- Server-side, anti-cheat grading (practice only — see ADR-0001).
- Objects/classes/recursion-tree visualisation beyond variables, loops and
  array pointers.
- Mobile-optimised editing (pages must render at phone width; writing code
  on a phone is not a v1 goal).

## How users see progress

- **Per problem:** status — not started / attempted / solved / mastered.
  _Mastered_ = solved **and** block rebuild completed **and** at most one
  hint level used _(open: exact rule)_.
- **Progress page:** solved and mastered counts, problems by concept tag
  (loops, arrays, pointers…) with per-tag mastery, and attempts-to-pass
  and hints-used trends over time.
- **"Learning that sticks" signal** _(open)_: a revisit prompt a few days
  after mastery — rebuild the solution again from blocks — to show
  retention, not just a one-off pass.

## Success metrics (for the demo)

- A learner who fails a problem can name the bug after the trace replay,
  without reading hint level 3.
- Median hints used per solved problem goes down over a learner's first
  five problems.

## Open decisions (before finalising)

1. ~~Language for v1~~ — Python (team agreed).
2. Hints: hand-authored vs. AI-generated (a free-tier API was mentioned;
   provider not chosen). Decides whether AI usage tracking stays.
3. Exact "mastered" rule, and whether the spaced revisit is in v1.
4. Number of seeded problems beyond Two Sum.
5. Track ownership (engine vs. visualiser) — decided on the team call.
