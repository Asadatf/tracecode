# 0011. The Daily Exam runs fully automatically, and its AI assessment uses all the evidence

Date: 2026-11-06
Status: Accepted (Umair, 2026-11-06; teammate sign-off outstanding). Amends 0010. **Amended by
0012** (reusable weighted pool replaces §2 "never reuse" and the inventory consequence).

## Context

ADR-0010 designed the Daily Exam with routine human administration: a schedule editable through
a flag payload, a draft-to-approved pool workflow, admin pre-selection, an exams console, admin
retries and cancellations. The product owner does not want any routine administrator duties.
The exam must run every day without anyone touching it, with protected mechanisms kept only for
genuine exceptions. The owner also defined the AI post-exam assessment more fully: it must reason
over the submission, the Sandbox results, the timing and the integrity record, and keep facts,
estimates and unverified observations apart.

## Decision

1. **A fixed schedule in code.** `src/lib/exam/schedule.ts` (`schedule@1`): opens 15:00 UTC,
   admits until 15:10, closes 15:30 with no overtime, results targeted by 16:30, problem public at
   the next 00:00 UTC, event metadata kept 90 days after publication. Changing it is a reviewed code
   change that bumps the version. Each exam stores the version it was created with, so a change never
   moves an existing exam. `daily_exam` is a plain on/off flag with no payload. All enforcement uses
   the database server's `now()` (ADR-0010 §3).
2. **Automatic random problem selection at opening.** The move `scheduled → open` and the choice of
   problem are one conditional write: pick uniformly at random among `eligible` problems never
   assigned (`daily_exams.problemId` is unique, so a problem can never be reused), and persist it. Two
   concurrent openers cannot both win, and the loser reads the winner's choice. There is no reuse
   until a reuse policy is explicitly introduced. If nothing is eligible, the exam becomes
   `cancelled` (`no_problem`), the page says the exam cannot run today, and an alert is raised. It
   never invents a problem or reuses one. The query scales to any pool size.
3. **The pool is validated once, when it is loaded.** `scripts/load-exam-pool.mts` reads git-ignored
   files and validates every problem: schema, unique slug, reference solutions pass the hidden suite
   in the real Sandbox, deliberately wrong solutions fail it, and the public practice set is not the
   hidden suite. Only then does it insert the problem as `eligible`. There is no per-exam approval.
   The owner reviews a pack before it is loaded; that is a one-time act per pack, not a daily one.
4. **Fully automated processing on the agreed queue** (ADR-0010 §12): closeout, grading,
   integrity scoring, result finalisation, leaderboard, notifications, next-day publication with
   learning credit, retention. Every step is idempotent, recoverable (leases, retries) and observable,
   and needs no human for a successful run.
5. **No routine administration.** No schedule screens, no problem selection or approval, no
   publication controls, no exam dashboard, no exam RBAC permissions or console. What remains are
   **protected maintenance mechanisms for exceptions only**, run as audited CLI scripts against the
   database by a maintainer (no UI):
   - re-queue a dead job;
   - void an exam after a security incident;
   - retire a leaked problem;
   - load a new pool pack;
   - resolve an integrity appeal (an appended decision and re-publication).
     Observability is automatic: an alert (Sentry via `captureError`) when an exam misses its results
     target, when a job goes dead, when fewer than 7 eligible problems remain, and when an exam cannot
     run. Counts are also available from a protected status endpoint.
6. **The AI assessment uses all four evidence categories**, through the existing Tracy integration
   and the queue (`EXAM_AI_EVALUATION`):
   - **Solution:** the submitted source, approach, implementation quality, estimated complexity, and
     incomplete, brute-force, efficient or optimal.
   - **Tests:** the Sandbox pass count, the correctness outcome and aggregate failure categories
     (wrong answer, exception, timeout, memory, recursion, missing entry). Never cases or expected
     outputs.
   - **Time:** opening, admission and submission timestamps, elapsed, and remaining at submission.
   - **Integrity:** the policy's summary (counts, durations, screen-check status, media
     interruptions), each with its confidence level, plus the deductions actually applied.

   Facts are rendered by the application from stored data, never by the model. The model returns a
   structured assessment (overall, correctness gaps, efficiency, time management, integrity
   observations, deduction explanation, recommendations, summary), with every statement tagged
   `fact`, `estimate` or `unverified`. The output is validated before it is stored:
   - it must match the schema;
   - integrity statements may refer only to event categories actually present;
   - wording that asserts misconduct or a captured screenshot is rejected and the job retried;
   - it contains no replacement code and, before publication, no reference solution.

   The AI never changes scores, ranks or events. It runs after result finalisation, is cached exactly
   once, never blocks publication, and is delivered with the result when ready. Its output cap rises
   to 900 tokens for the exam (the M9 challenge assessment keeps 450).

7. **One database.** The existing Supabase project is used (owner authorisation, 2026-11-06). M10
   migrations are additive (new tables, indexes, foreign keys to `users`, RLS enable) and reviewed as
   SQL before they apply. They reach the database only through the repository's sanctioned path: CI
   generates the migration on a pull request and `deploy-migrations.yml` applies it on merge. That
   happens only after the project identity is checked and a recoverable backup is confirmed. No
   existing table is altered. M10 stays disabled until the whole scheduled lifecycle is verified.

## Alternatives considered

- **Keep an admin console for routine operations.** Rejected by the owner. Exceptions are rare
  enough for audited scripts.
- **Deterministic (hash-of-date) selection.** It is predictable by anyone who knows the pool order.
  Random choice persisted at opening is as reproducible and not predictable.
- **Let the AI write the factual sections.** A model can misstate facts. The application renders the
  facts and the model interprets them under validation.
- **A separate test database.** The owner chose the existing project with additive migrations and a
  backup instead.

## Consequences

- ADR-0010 §2 (configurable schedule), §5 (owner approval of each problem, admin pre-selection) and
  every "admin console" / `exams.*` permission item are replaced. Everything else in 0010 stands.
- **Genuine operational dependencies remain** (listed in the spec), most importantly: with no reuse
  policy, the pool runs out after as many days as it has problems (7 at launch), so new packs must be
  authored and loaded ahead of depletion. Others are appeals, the scheduler and its secrets, Sandbox
  and AI provider quotas, and Hobby plan limits.
- The integration and end-to-end runs use clearly marked test exam dates and test accounts in the
  shared database. They never use real learners' attempts, and they are cleaned up only through the
  same audited scripts.
