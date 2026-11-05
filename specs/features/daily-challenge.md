# Feature: Daily Learning Challenge

Status: Agreed (Umair; scope changed on 2026-11-05 from a competitive exam to a learning
challenge with one server-graded final Submit, see
`decisions/0008-daily-challenge-is-a-learning-exercise.md`).
Owner: Umair
Related: `decisions/0008-daily-challenge-is-a-learning-exercise.md` (this scope),
`decisions/0007-server-side-competitive-grading.md` (the dormant grader),
`decisions/0001-in-browser-python-execution.md`, `specs/features/streak.md`,
`specs/features/activity-heatmap.md`, `specs/features/problems-page.md` (the calendar)

## Why

A fixed problem each day, with a gentle 30-minute target and one final, honestly graded
submission, gives learners a reason to come back and a true measure of how they did alone.
It is a personal learning exercise: there are no scores, rankings, deadlines or comparisons
between learners, and no claim to detect outside help. It stays distinct from Practice
(a clock, no Tracy or hints, one try) and its result is checked on the server, never taken
from the browser.

## Daily challenges

- **AC1** — GIVEN a UTC date THEN it has exactly one challenge, the same for every
  learner. The assignment starts as the deterministic hash the calendar always used,
  over the eligible problems (the catalogue's problems), and is **pinned** (a
  `daily_challenges` row) the first time the date is needed. It never changes after that,
  so adding or removing a problem cannot rewrite a past or present assignment.
- **AC2** — GIVEN a date after today (UTC) THEN it cannot be opened or previewed: the page
  is a 404, nothing is read or created for it, and the calendar shows it locked and
  unlinked. A malformed date is a 404.
- **AC3** — GIVEN a past date THEN clicking it on the calendar goes straight to the normal
  Practice workspace for that day's problem (there is no separate past-challenge page); opening
  `/challenge/<past date>` redirects there too. It cannot be started as a challenge (only the
  current UTC day can). A past date the learner already started keeps its own challenge page
  with its timer and result.
- **AC4** — GIVEN today's date THEN a signed-in learner can start the challenge.
- **AC5** — GIVEN the Problems calendar THEN it keeps its design; each past and current
  date links to its challenge page, a future date is a locked non-link, and titles come
  only from pinned assignments.

## The challenge

- **AC6** — GIVEN the challenge page THEN it uses the Practice look (app shell, full-height
  panes, same fonts and editor) with exactly two panes: the problem and the code editor.
  There is no results, Tutor or third pane. The divider is draggable and keyboard operable.
- **AC7** — GIVEN the page THEN it shows only the statement, the public examples, a code
  editor, the timer, Run, the final Submit (and Start before starting). Tracy, hints, replay,
  reference solutions, solution history and topic labels are not rendered or sent to the
  browser, and neither are the problem's tests.
- **AC8** — GIVEN Start THEN the server records `startedAt` once. Starting again (a refresh,
  a second tab, a double click) returns the same record and the same start time. The
  browser's clock is never trusted: the timer is `server now at page load - startedAt`,
  advanced by the browser only for display.

## The timer is a soft target

- **AC9** — GIVEN a started challenge THEN the toolbar shows a prominent countdown from 30
  minutes (`EXAM_DURATION_MS`). It is a target for the learner's own feedback and nothing
  more.
- **AC10** — GIVEN the countdown reaches 00:00 THEN it switches to an "Overtime" indicator
  with the elapsed overtime, without limit. Nothing expires, nothing is submitted for the
  learner, and Run and the final Submit stay available. There is no deadline, no grace and
  no `expired` state; elapsed time is recorded uncapped.
- **AC11** — GIVEN a refresh, a second tab, a retry or UTC midnight THEN the timer continues
  from the server-recorded `startedAt`: an attempt started at 23:50 UTC is still running at
  00:05. The timer stops at the final submit.

## Run and the ONE final Submit

- **AC12** — GIVEN Run THEN it tries the PUBLIC examples in the browser as feedback, without
  limit. Its result is never sent to the server and never used for anything else.
- **AC13** — GIVEN the final Submit THEN there is exactly ONE per learner per challenge, after
  a confirming second click. The server enforces it with the `challenge_attempts` unique
  `(userId, challengeDate)` key and one conditional state change (`started -> submitted`);
  duplicate and simultaneous requests find it already moved on, and the first source wins.
  It is valid at any time, including in overtime and after UTC midnight.
- **AC14** — GIVEN a final submission THEN only its source is sent. The server grades it in a
  Vercel Sandbox (no network, one process per test) against the full server-only hidden test
  suite and compares outputs with answers that never leave the server. Nothing the browser
  reports (pass counts, results, times) is accepted or stored.
- **AC15** — GIVEN the grading result THEN the learner sees the final status and counts ("N of
  M tests passed", never which tests) and their elapsed time. No score, rank or comparison
  exists. A failed final submission is final: it cannot be retried that day, does not complete
  the challenge, and creates no Attempt, progress or review.
- **AC16** — GIVEN grading is switched off (`challenge_server_grading`, default off), the
  Sandbox is unavailable, or a try fails THEN the page says "Submission saved — grading
  pending" and never treats it as a failed challenge. The source is kept; grading is retried
  (bounded tries with a backoff, by the status poll and the daily cron); a restore of the
  grader grades it with no new submission.

- **AC15a** — GIVEN a final submission is graded, pass or fail, THEN the learner gets one
  in-app notification (the bell) saying their result is ready, with the counts ("Binary Search:
  5 of 12 tests passed.") and a link to the challenge. It is created once, by the grading
  winner (unique per learner and date), respects the existing in-app preference, and is best
  effort: it never fails the grading. No email is sent for it: the existing email channel needs
  a verified sending domain and is off unless configured.

## Completion, streak and reviews

- **AC17** — GIVEN a fully passing verified submission THEN, in the same transaction as the
  grading transition (so only its single winner runs it), one `Attempt` is recorded and
  linked, and the learner's progress is updated, all dated at the SUBMISSION time, not the
  later grading time, so a submit just before UTC midnight counts for the day it was made.
  The existing streak and activity graph count it with their own semantics, once per day.
- **AC18** — GIVEN that same pass is meaningful work (not an untouched starter) THEN the
  spaced-review cycle (M9C) is started or advanced for the problem, once, dated at the
  submission. A replay of the grading changes nothing.
- **AC19** — GIVEN the Problems calendar THEN today's row shows "Completed" for a passing
  graded submission, and "Submitted" for a failed or still-pending one.

## AI assessment of the final submission

- **AC20** — GIVEN a graded final submission, pass OR fail, THEN a short AI assessment is
  generated once: an approach summary, estimated time and space complexity, whether the
  approach looks brute force, reasonably efficient or optimal, and one improvement suggestion
  in words (replacement code is refused). It is always labelled an AI estimate, "not proof
  that the solution is correct or optimal". It never runs on Run, while the challenge is open,
  or while grading is pending.
- **AC21** — GIVEN the AI call THEN it reuses the existing Tracy integration and nothing new:
  the same provider adapter and model configuration (`resolveTutorConfig`), usage tracked in
  `ai_usage` under `challenge_assessment`, the same per-user rate limit, output capped at 450
  tokens, a 20-second timeout, code capped at 8,000 characters. The model gets the problem
  statement, the learner's submitted code (read server-side) and only the NUMBER of hidden
  tests passed, never which tests, their inputs, answers, reference solutions or hints. The
  Tracy chat, hints and replay are not part of the page.
- **AC22** — GIVEN an assessment THEN it is stored once on the challenge attempt
  (`challenge_attempts.assessment`, claimed first by a conditional write). Reloads, second
  tabs and duplicates serve it with no model call; simultaneous requests make one call; a failed
  try is not repeated for two minutes; if storage is unavailable no call is made. If the AI
  fails the result is unaffected and the panel says "AI feedback is unavailable right now".

## Hidden and dormant

- **AC23** — GIVEN the product THEN the leaderboard, its navigation, its opt-in setting and
  the weekly standings archive are off (`LEADERBOARD_VISIBLE = false`: the page is a 404 and
  `closeFinishedWeeks` does nothing). The tables and existing rows are untouched.

## Delivery status

Built and tested: the daily assignment and calendar, the two-pane page, the server-owned soft
timer, unlimited Run, the one-shot final Submit through the existing `challenge_attempts`
lifecycle, server grading through the Sandbox grader and hidden suites, completion, streak
and review integration dated at the submission, the stored AI assessment, and the hidden
leaderboard. **Off until enabled:** server grading (`challenge_server_grading`, default off,
and needs the deployment's Sandbox credentials); until then a final submission is saved as
"grading pending". The grader was verified once against a real sandbox (ADR-0007).

## Data / API

- Reuses `daily_challenges` (the pin) and the whole `challenge_attempts` lifecycle
  (`started -> submitted -> grading -> graded | grader_error`; `deadlineAt` is the soft
  target, never a cutoff; `score` stays unused). One small additive migration,
  `challenge_attempts.assessment` (JSON) and `assessmentClaimedAt` (timestamp), for AC22;
  until it is applied the page works and shows "feedback unavailable" without calling the AI.
- Server Actions (a date, plus the source for Submit, and nothing else):
  `startChallengeAction`, `submitChallengeAction`, `challengeStatusAction`,
  `assessDailyAction`. The earlier exam actions remain
  but the page does not call them.
- No analytics events.

## Edge cases

- Only problems with a verified server-only hidden suite are eligible (today the original six), so challenges repeat within days. The ten catalogue-expansion problems are Practice-only until their hidden suites are authored and verified.
- A grader that keeps failing is retried a bounded number of times, then the submission stays
  saved as pending (never a fail) for the cron to retry later.
- A learner who submits and closes the tab still gets graded: the status poll, the next visit
  and the cron all nudge it along.
- A submit made seconds before UTC midnight and graded after it counts for the submission day.
- A leftover `expired` row from the earlier exam design is open again (it can be submitted
  once).
- Past a long overtime the timer keeps counting; there is no maximum.
- The AI assessment can be wrong (it reads code, it does not run it); the copy says so.
- A learner who deletes their account cascades their records.
- No tab-focus, paste or other surveillance signals are collected, and no claim is made to
  detect outside help.

## Tests

`src/lib/challenge/{daily,exam-rules,service,assessment,week,assignment}.test.mts`,
`src/server/challenge/challenge.test.mts`, `src/components/challenge/challenge.test.mts`
(plus the grader's tests), and rolled-back database checks of the one-shot lifecycle.

## Changelog

- 2026-11-05 — created as a competitive exam (grading disabled).
- 2026-11-05 — rescoped to the Daily Learning Challenge: soft 30-minute target, unlimited
  Run/Submit, derived completion, leaderboard hidden.
- 2026-11-05 — the post-solve assessment is an AI assessment reusing Tracy's integration,
  stored once (replacing a rule-based estimate).
- 2026-11-05 — final design: exactly ONE final Submit per learner per challenge, graded on
  the server in the Sandbox against the hidden suites (`challenge_server_grading`), counts
  only, no browser-reported results; soft timer kept; streak/reviews dated at the submission;
  the AI assessment covers failed submissions too; leaderboard and standings archive off.
