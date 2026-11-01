# Feature: Learning statistics engine (M6.1)

Status: Draft
Owner: Umair
Related: `specs/00-product.md`, ADR-0001 (pass/fail is client-reported telemetry)

## Why

M7 recommendations need a deterministic, evidence-based picture of what a
learner has actually done. This feature derives it from the M4 records
(`attempts`, `replay_sessions`, `learning_events`) with no new tables and no
UI. Metrics describe recorded activity only; they never claim that a hint or
replay caused a later pass.

## User stories

- As the M7 recommender, I want typed per-learner statistics, so that
  recommendations rest on recorded evidence instead of guesses.

## Acceptance criteria

- **AC1** — GIVEN a learner with no records WHEN statistics are computed THEN
  `hasActivity` is false, every count is 0 and every rate/mean/median is
  `null` (never NaN).
- **AC2** — GIVEN attempts on several problems WHEN computed THEN totals give
  attempts, passed (`allPassed`), failed, pass rate = passed / attempts,
  problems attempted/solved, and per problem the 1-based index of the first
  all-passed attempt, with mean and median over solved problems.
- **AC3** — Attempts are ordered by `createdAt`, ties broken by `id`; input
  order never changes the output.
- **AC4** — Per problem: full submission history; pass fraction =
  testsPassed / testsTotal (`null` when testsTotal is 0); first, latest and
  best fraction; delta = latest − first; trend `improving` / `declining` /
  `flat`, or `single_attempt` with fewer than two measurable attempts; and a
  count of attempts that beat the previous measurable attempt.
- **AC5** — Replay engagement = linked sessions + fallback events. A linked
  replay writes a session and a `replay_inspected` event, so per
  (problem, testId) only the events beyond the session count are fallbacks
  (clamped at 0). Nothing is counted twice.
- **AC6** — `hint_revealed` details of the form `<promptId>:L1|L2|L3` count as
  Observation / Reasoning / Strategy. Anything else counts as `unclassified`.
  Distinct reveals count each (problem, detail) pair once.
- **AC7** — A repeat failure is a run of 2 or more consecutive failed attempts
  on one problem. A recovery is such a run followed directly by a pass. The
  longest failure run is reported per problem.
- **AC8** — Every query is filtered by the session user's id. A
  caller can't pass in a user id.

### M6.2: Behavioural analysis

Output is split into `observed`, which is facts read from the records, and
`inferred`, which is rule-based hypotheses tagged `basis: 'inferred'`, each
carrying its evidence. A hint or replay that sits next to an outcome is
co-occurrence in time and never a cause. An event counts as preceding an
attempt only if its timestamp is strictly earlier.

- **AC9** — Failure pattern per problem is one of: `no_attempts`,
  `no_failures`, `isolated_failures`, `repeat_failures_recovered`, or
  `repeat_failures_unresolved` (history ends in a run of 2 or more failures).
  Also reported: tests that failed in 2 or more attempts, with their longest
  consecutive run and whether the latest attempt still fails them.
- **AC10** — Score changes across consecutive measurable attempts: drops,
  unchanged steps, largest gain, largest drop, and failures after the first
  solve. Rises reuse M6.1 `stepImprovements`.
- **AC11** — Hint reveals are split before and after the first solve (all
  before if unsolved). Each prompt has a ladder: levels revealed, highest
  level, skipped levels, and whether levels were revealed in order.
- **AC12** — Replay timing:
  - Linked sessions on failed and on passed attempts.
  - The share of failed attempts that had a linked replay.
  - Replays before and after the first solve, timed from `replay_inspected`
    events (every replay writes one).
  - Attempts after the first replay.
- **AC13** — Each pass directly after 1 or more failures records the failed
  attempt ids, the last failure's score, and the hints and replays recorded
  in [first failure, pass).
- **AC14** — Inferred signals:
  - `independent_first_solve`: no hint or replay before the first solve.
  - `first_solve_after_strategy_reveal`.
  - `possible_persistent_misconception`: the same test fails in 3 or more
    consecutive attempts.
  - `unresolved_struggle`.
  - `regression_after_solve`.

### M6.3: Structured insights

`generateLearningInsights(statistics, behavior)` reads only M6.1/M6.2 output.

- **AC15** — Each insight has a stable `type`, a `problemSlug` (null for
  account-wide), a short `message`, typed `metrics`, an `evidence` of
  `observed` or `inferred`, a `precision` of `exact` or `approximate`, and a
  `priority`. Output is sorted by priority, then slug, then type.
- **AC16** — `precision` is `approximate` when the claim rests on count-based
  replay dedup (any fallback events) or on event timing relative to an
  attempt. Messages then hedge ("about", "recorded before").
- **AC17** — No activity gives a single `no_activity` insight. Fewer than 3
  submissions adds `limited_history`. Score trends need 3 or more measurable
  submissions on the problem. `replay_not_used` needs 3 or more failed
  submissions.
- **AC18** — Suppression rules:
  - Trends only while the latest attempt fails, and never alongside
    `regression_after_solve`.
  - No `recovered_after_repeated_failure` while a failure run is open.
  - `persistent_test_failure` only for a test that still fails.
  - `independent_first_solve` and `first_solve` are mutually exclusive.
- **AC19** — No message says a hint or replay caused an outcome.

## Data / API

- No model or migration changes.
- `src/lib/learning/statistics.ts` holds `computeLearningStatistics(records)`,
  a pure function.
- `src/lib/learning/behavior.ts` holds
  `analyzeLearningBehavior(statistics, records)`, also pure.
- `src/lib/learning/insights.ts` holds
  `generateLearningInsights(statistics, behavior)`, also pure.
- `src/lib/learning/replay-writes.ts` holds the replay row payloads, shared by
  `recordReplaySession`, `persistReplay` and the tests.
- `src/server/learning/statistics.ts` holds `getLearningAnalytics()`, which
  is server-only and returns
  `{ authenticated, available, analytics: { statistics, behavior, insights } | null }`.
- No analytics events.

## Edge cases

- Empty / first-time state: AC1. A problem that has replay or hint events but
  no attempts appears in `problems` but is not counted as attempted.
- Errors: a DB failure is reported via `captureError` and returns
  `available: false`. It never throws.
- Unauthenticated: returns `authenticated: false` and `analytics: null`.
- Data limits:
  - Events carry no attempt id, so the AC5 matching is count-based per
    (problem, test). It can't tell which specific event belonged to a session.
  - Before M4's linking fix, every replay was a fallback event.
  - Pass/fail is client-reported (ADR-0001).
  - `ProblemProgress.attempts` is a counter. These stats recount from
    `attempts` rows instead.

## Tasks

- [x] Pure calculator and unit tests (AC1–AC7)
- [x] Server loader scoped to the user (AC8). `getLearningAnalytics()`
      loads the records once and returns `{ statistics, behavior, insights }`.
- [x] Behavioural analysis and tests (AC9–AC14)
- [x] Structured insights and tests (AC15–AC19)
- [ ] Agree this spec

## Changelog

- 2026-11-01: created.
