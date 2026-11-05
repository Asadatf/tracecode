# Feature: Daily coding challenge and weekly leaderboard

Status: Agreed (Umair, via the M9B brief; no teammate sign-off). **Competitive scoring is
built but disabled** (see "Delivery status").
Owner: Umair
Related: `decisions/0007-server-side-competitive-grading.md`, `decisions/0001-in-browser-python-execution.md`
(practice stays browser-side), `specs/features/streak.md`, `specs/features/activity-heatmap.md`,
`specs/features/public-profile-settings.md`, `specs/features/problems-page.md` (the calendar)

## Why

A fixed daily problem, taken under the clock and ranked fairly, gives learners a reason to
come back and a measure of independent performance. It reverses three earlier "out of
scope" decisions in `specs/00-product.md` (leaderboards, timed rounds, server-side
grading) and is bounded by them: practice stays browser-side and untrusted, and ONLY
server-verified results are ever scored or ranked.

## Daily challenges

- **AC1** — GIVEN a UTC date THEN it has exactly one challenge, the same for every
  learner. The assignment starts as the deterministic hash the calendar always used,
  over the eligible problems (those with a hidden suite), and is **pinned** (a
  `daily_challenges` row) the first time the date is needed. It never changes after that,
  so adding or removing a problem cannot rewrite a past or present assignment.
- **AC2** — GIVEN a date after today (UTC) THEN it cannot be opened or previewed: the page
  is a 404, nothing is read or created for it, and the calendar shows it locked and
  unlinked. A malformed date is a 404.
- **AC3** — GIVEN a past date THEN its challenge can be viewed and practised in the normal
  workspace, but cannot be attempted competitively and never affects a week's standings.
- **AC4** — GIVEN today's date THEN the challenge can be started as one timed, scored
  attempt by a signed-in learner.
- **AC5** — GIVEN the Problems calendar THEN it keeps its design; each past and current
  date links to its challenge page, a future date is a locked non-link, and titles come
  only from pinned assignments.

## Timed assessment

- **AC6** — GIVEN Start THEN the server records `startedAt` and sets `deadlineAt = startedAt
  - 30 minutes`. The window is fixed at 30 minutes (`EXAM_DURATION_MS`).
- **AC7** — GIVEN a learner and a challenge THEN there is at most one attempt, guaranteed by
  a unique `(userId, challengeDate)` key. Starting again (a refresh, a second tab, a double
  click) returns the same attempt and the same deadline.
- **AC8** — GIVEN the countdown THEN it is a display only, derived from the server's
  deadline and its "now" at page load. A changed browser clock changes the display, never
  when the attempt ends: every submission is judged against the server's recorded deadline.
- **AC9** — GIVEN Submit THEN there is ONE final submission. It is accepted only while
  `now <= deadlineAt + 5 s` (a small allowance for the auto-submit at zero), as a single
  conditional update in the write itself. A later submission is refused, the attempt is
  `expired`, and it earns nothing. A repeat or simultaneous submission finds the attempt
  already submitted and changes nothing (the first source wins).
- **AC10** — GIVEN the page is refreshed or the session interrupted THEN the attempt and its
  deadline resume from the server; an unsent draft is restored from local storage as a
  convenience only. An attempt never submitted is `expired` once its time has passed.
- **AC11** — GIVEN the assessment screen THEN it shows only the statement, the public
  examples, a code editor, a visible countdown, Start, Run and Submit. Tracy, hints,
  replay, solutions and topic labels are not rendered; the one-submission rule is shown
  before Start; Submit needs a second confirming click. It has not-started, running,
  submitting, awaiting-grading, graded, grader-error, expired and error states.
- **AC12** — GIVEN Run THEN it executes the PUBLIC examples in the browser as feedback. Its
  result is never sent to the server and never used for a score.

## Grading and the trust boundary

- **AC13** — GIVEN a submission THEN its score exists only because the server-side grader
  produced it: the learner's code runs in an isolated, network-less sandbox microVM (never
  in the Next.js process) on the hidden cases' INPUTS only; the sandbox returns outputs;
  the server compares them with hidden expected answers that never leave the server. No
  browser-reported pass count, score, time or result is accepted or stored.
- **AC14** — GIVEN grading THEN each hidden case runs in its own process with a time limit,
  so one infinite loop or crash costs only that case. A grader failure is recoverable
  (`grader_error`, retried from the stored source, never a score either way). Only the
  winner of the `submitted -> grading` claim runs the grader; only the `grading -> graded`
  transition writes a score.
- **AC15** — GIVEN no grader is configured THEN a submission is stored and shown as
  "saved, awaiting grading", is never scored, and the leaderboard stays empty. The grader
  runs only if the `challenge_competitive_grading` flag is on AND the sandbox is available;
  the flag defaults off. `@vercel/sandbox` is installed but nothing creates a sandbox
  while the flag is off.
- **AC16** — GIVEN the hidden suites THEN they live only under `src/server/challenge/`
  (server-only wrapper), are not part of the client bundle, and are separate from the public
  practice tests. A suite is validated against the verified reference solutions: every
  compliant one passes every case and every non-compliant one fails at least one.
- **AC17** — GIVEN a submission THEN its source is stored privately, readable only to
  grade it and to record a verified solve, and appears on no public surface.

## Scoring and the leaderboard

- **AC18** — GIVEN a graded day THEN its score is `round(1000 x passed / total)`, plus, for a
  full pass only, up to 100 more scaled linearly by the time left. An unsubmitted, expired,
  ungraded or errored day scores nothing. A week's score is the sum of its days.
- **AC19** — GIVEN a week THEN it starts Monday 00:00:00 UTC and is identified by that
  Monday; a day belongs to the week of its challenge date, so a Sunday-night attempt graded
  just after midnight still counts for its own week. A week is archived once it has ended
  plus a one-hour grace.
- **AC20** — GIVEN ranking THEN ties are broken, in order, by more days fully solved, lower
  total time on those days, then the earlier final scoring submission; learners equal on
  all of them share a rank (1, 2, 2, 4). The rules are shown on the leaderboard page.
- **AC21** — GIVEN the public board THEN it lists the top 20 learners who have **explicitly
  opted in** (a separate setting, off by default; a public profile alone is never consent)
  and have a username, ranked only from verified scores, by username and numbers only: no
  email, internal id or source. A profile link appears only if that profile is public.
- **AC22** — GIVEN a signed-in learner with a verified result who is not listed THEN they see
  their own rank privately, "rank X of N" among the public competitors counting themselves,
  and are not discoverable. A learner may opt in or out at any time in Settings; opting in
  needs a username.
- **AC23** — GIVEN a closed week THEN its standings are frozen once (`weekly_standings`,
  idempotent) with a rank only for those opted in at that moment, and past weeks remain
  viewable. A week with no verified result shows an honest empty state, never an invented
  score or position.
- **AC24** — GIVEN a fully-passing, verified submission THEN exactly one `Attempt` is
  recorded in the same transaction as the grading transition (and linked to the challenge
  attempt), so the streak and activity graph count it with their existing semantics and the
  same event is never counted twice. A partial or failing result records none.

## Delivery status

Built and tested: daily assignment and the calendar, the timed lifecycle and page, the
grading architecture (orchestration, runner, comparator, sandbox adapter, hidden suites),
the leaderboard and consent, and the weekly archive. **Not active:** competitive grading.
`@vercel/sandbox` is installed and bound by a typed adapter; the runner is hardened
(`sandbox-runner-v3`) and grading retries are bounded (3 tries, growing backoff, then the
attempt stays `grader_error` with no score). Activation still needs (1) a human review of
the hidden suites, (2) one live run of `scripts/verify-sandbox-grading.mts --confirm` on the
project's plan and credentials (it creates real sandboxes), and (3) the flag turned on.
Until then no submission is graded and no score or ranking exists.

## Data / API

- Tables `daily_challenges`, `challenge_attempts`, `weekly_standings` and `User.
leaderboardOptIn` (`prisma/schema/challenges.prisma`). Each new table needs the
  CI-generated create migration and the hand-written RLS-enable migration.
- Server Actions: `startChallengeAction`, `submitChallengeAction`, `challengeStatusAction`,
  `setLeaderboardOptInAction` — strict inputs, none takes a user id, a score or a result.
- The weekly close runs in the existing cron route as an independent step.
- No analytics events.

## Edge cases

- A catalogue of six problems means challenges repeat within days.
- A submission whose grading keeps failing is retried at most three times, then left
  unscored (`grader_error`); it never costs more sandboxes and never gets points by default.
- Burst submissions can exceed the sandbox's concurrency; a submission waits in
  `submitted` and is retried on the next status poll.
- A learner who deletes their account cascades their attempts and standings.
- Informational signals (tab focus, paste) are not collected: no surveillance and no claim
  that external help can be detected.

## Tests

`src/lib/challenge/*.test.mts`, `src/server/challenge/challenge.test.mts`,
`src/components/challenge/challenge.test.mts`.

## Changelog

- 2026-11-05 — created (Agreed; grading disabled).
