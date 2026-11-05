# 0008 — The daily challenge is a learning exercise, not a competition

Status: Accepted (Umair, 2026-11-05)
Builds on: 0007 (the Sandbox grader is reused for the final result, without scores or ranks)

## Context

M9B was built as a timed, scored, ranked weekly competition with server-side grading in a
Vercel Sandbox (ADR-0007). The product direction changed: the daily challenge should help
learners practise and pace themselves, without competition or exam pressure.

## Decision

The Daily Learning Challenge keeps the pinned daily assignments and the calendar, the
Practice-style two-pane page and the server-owned `startedAt`. The 30-minute limit is a soft
target: Overtime is shown without limit, nothing expires, Run (public examples) is unlimited
and the one final Submit stays valid at any time.

There is exactly ONE final Submit per learner per challenge, enforced durably by the existing
`challenge_attempts` unique key and its conditional state change. The final result is
produced by the existing server-side pipeline: the Sandbox grader runs the submitted code
against the server-only hidden suites and the server compares outputs; nothing the browser
reports is trusted. The learner sees test counts and a status, never a score or a rank. A
full pass records one Attempt (and progress, and the M9C review) in the grading transaction,
dated at the SUBMISSION so UTC midnight cannot move it; a failed final records none and
cannot be retried. When the grader is unavailable the page says "Submission saved — grading
pending" and retries later.

The grading switch is renamed `challenge_server_grading` (default off; no overrides existed
under the old name). After grading, pass or fail, one AI assessment of the submitted code
(approach, complexity, efficiency, one improvement) is produced through the existing Tracy AI
integration, tracked in `ai_usage`, rate limited and stored once on the challenge attempt;
it never sees the hidden tests, only how many passed.

The leaderboard, opt-in and weekly archive are hidden or off (`LEADERBOARD_VISIBLE = false`);
their tables and rows stay. The assessment needs one small additive migration (two nullable
columns on `challenge_attempts`).

## Consequences

- Completion rests on server-side grading, so it needs the Sandbox working in the deployment
  (credentials, plan limits). Until then a final submission waits as "grading pending".
- Reviving competition later needs a new spec decision, the grader's live verification
  (already done once) and flipping the switches above.
- Unused tables and server code remain, and need the usual care when the schema changes.
