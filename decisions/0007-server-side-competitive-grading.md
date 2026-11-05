# 0007. Competitive grading: server-verified execution in an isolated sandbox, behind a flag

Date: 2026-11-05
Status: Accepted (Umair; no teammate sign-off yet). **Competitive scoring is not enabled.**

## Context

ADR-0001 runs and grades practice in the browser, so a pass or a fail is telemetry, not a
verified result, and `specs/00-product.md` listed leaderboards, timed rounds and
server-side grading as out of scope. M9B adds a daily timed challenge and a weekly
leaderboard. A ranking built on browser-reported results is a ranking of who can call an
endpoint most convincingly, so for the competitive path only a result the server itself
produced can count. Three constraints shape the design:

- The product runs on Vercel serverless; learner code must never execute in the Next.js
  process. Pyodide in a Node function is **not** an isolation boundary (Python's `js`
  module reaches host globals), and the repo's CPython runner is test-only.
- Today every catalogue test, with its expected answer, ships to every browser inside the
  practice workspace, so those tests cannot be hidden.
- The existing engine program holds the expected answers in the same process that runs
  learner code, so a learner's code could read and return them.

## Decision

1. **Practice stays as ADR-0001 says. Only the daily challenge is competitive**, and its score
   comes only from server-verified execution. A browser-reported pass count, score, time or
   result is never accepted, stored or used.
2. **Execute in an isolated sandbox, judge on the server.** The learner's code runs in a
   Vercel Sandbox Firecracker microVM created with `networkPolicy: 'deny-all'`, a bounded
   timeout and no persistence. Only the hidden cases' **inputs** are written into the
   sandbox; a small stdlib runner executes each case in its own subprocess with a time limit
   and returns the outputs; the **expected answers never leave the server**, which compares
   outputs with Python-equality semantics. Learner code therefore cannot read, return or
   exfiltrate an answer, and a single infinite loop costs only its own case.
3. **Hidden suites are separate data**, authored for the six eligible problems, server-only
   (a `server-only` wrapper plus a scan test that fails if anything outside
   `src/server/challenge/` imports them). Each is validated against the verified reference
   solutions, including the deliberately wrong ones. They need human review before
   competitive scoring is turned on.
4. **Server-owned time and one submission.** The deadline is recorded by the server at Start
   (30 minutes). The one scored submission is a conditional update that enforces the deadline
   in the write itself; every state change is a single conditional write on the state the
   caller expects, so duplicate and concurrent requests cannot double-submit, double-grade or
   double-score. The score is written in exactly one transition (`grading -> graded`).
5. **Off by default, twice.** Grading runs only if the `challenge_competitive_grading` flag is
   on AND the Sandbox SDK is present. The SDK is deliberately **not** yet a dependency (it is
   loaded through a guarded dynamic import), so the app builds without it and no sandbox can
   be reached. With no grader a submission is stored and waits; nothing is scored or ranked.
6. **Privacy.** Submitted source is private (selected only to grade and to record a verified
   solve). The leaderboard requires a separate explicit opt-in (never implied by a public
   profile), shows only a username and verified numbers, and lets a non-listed learner see
   their own rank privately. No camera, microphone, screen recording or other surveillance,
   and no claim to detect outside help.

## Consequences

- **Dependency and platform.** Turning grading on needs `@vercel/sandbox` added, Sandbox
  available to the project's plan, credentials at runtime (Vercel's OIDC token is automatic
  in production; local development needs `vercel link` and an environment pull), and the
  flag enabled. Documented plan limits at the time of writing (Hobby: 5 active-CPU hours,
  5,000 sandbox creations a month, 10 concurrent, 45-minute sessions) are ample for a small
  cohort but a burst of simultaneous submissions can exceed the concurrency, so a submission
  waits and is retried. None of this has been verified against the live project.
- **Cost exposure.** One short sandbox per submission; about one active-CPU-second per case
  at most, bounded by per-case and total timeouts.
- **Residual risk.** This blocks forged scores and answer leaks. It cannot stop a friend or an
  AI helping with the code, and it says so rather than claiming otherwise.
- **Content cost.** Six hidden suites must be reviewed, and a six-problem catalogue repeats
  challenges within days.
- **Schema.** Three new tables and one `User` column; each table needs the CI-generated
  create migration and the hand-written RLS-enable migration.
- **Reversal.** Competitive grading can be switched off instantly by the flag; submissions
  are kept and simply stop being graded.
