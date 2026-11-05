# Feature: Spaced review and due-review reminders

Status: Agreed (Umair, via the M9C brief; no teammate sign-off)
Owner: Umair
Related: `decisions/0006-spaced-review-schedule.md`, `specs/features/streak.md`,
`specs/features/learning-recommendations.md`, ADR-0004 (notifications), ADR-0001

## Why

Learners come back more often, and learn more, when practice returns to earlier work.
After a learner solves a problem it comes back for review after 1 day, then 3, then 7.
A review is a scheduled reminder to solve the problem again from a fresh start. It is
not a measure of what the learner remembers, and nothing here claims it is.

## Lifecycle and policy

All days are UTC calendar days.

- **Enrol.** The first qualifying passing attempt on a problem (see Trust) starts its
  cycle: review 1 is due on the next UTC day. Problems solved before this feature are
  not enrolled; solving one again enrols it.
- **Review 1** is completed by a qualifying passing attempt on or after its due day;
  review 2 is then due **3 days** after the day review 1 was completed; review 3 is
  due **7 days** after review 2 was completed; completing review 3 ends the cycle.
- **Late is fine.** The next interval counts from the day the review was actually
  completed, so a learner who is late is not handed an already-overdue next review.
- **One pass, one stage.** A pass advances at most one stage. A pass before the due day
  changes nothing, so an ordinary solve can never skip a stage; duplicate or concurrent
  requests advance exactly one stage (a single conditional update on the stage the
  caller saw).
- **Retry policy.** An unsuccessful attempt (failing, starter-only, syntax error,
  timeout, engine error) changes nothing: the review stays due and can be retried any
  time. It is not reset to an earlier stage and not penalised.
- **What does not complete a review:** opening the problem, a failing run, reading a
  Tracy explanation or asking Tracy (none of these is even recorded).

## Trust

The result a browser reports is telemetry, not server-verified grading (ADR-0001); the
server never runs learner code. A review advances only if the attempt is a completed
run, judged meaningful by the server (`streak.md` AC4a), and its reported results
cover every catalogue test exactly once, all passed, with matching totals. That blocks
accidental and partial reports. A request that fabricates complete, matching results
can still advance a review: this is a known limit, closed only by server-side grading
(M9B). The server clock decides the day; the browser's is never used.

## Acceptance criteria

- **AC1** — GIVEN a qualifying all-pass on a problem with no review THEN it is enrolled
  with review 1 due the next UTC day.
- **AC2** — GIVEN the pending review is due and a qualifying all-pass THEN the stage
  advances by one, with the next due date 3 days (after review 1) or 7 days (after
  review 2) from that day; after review 3 the cycle is complete and nothing further
  advances.
- **AC3** — GIVEN a pass before the due day, a failing or non-meaningful attempt, a
  repeated request, or simultaneous requests THEN no stage is skipped and at most one
  is advanced.
- **AC4** — GIVEN 23:59:59 UTC the day before the due day THEN it does not complete the
  review; GIVEN 00:00:00 UTC on the due day THEN it does.
- **AC5** — GIVEN the Overview THEN a "Due for review" card lists up to five due or
  overdue reviews, most overdue first: title, topics, difficulty, "Review N of 3",
  "Due today" or "Overdue by N days", and a Start review link to the normal practice
  page (no second editor). It has loading, empty and unavailable states, shows a count
  beyond five, and says a review is not a memory measure. Signed out: nothing.
- **AC6** — GIVEN something is due THEN the "Up next" panel shows a labelled "Due for
  review" pointer beside the recommendation. The recommendation engine and its cache
  are unchanged; a review never replaces a recommendation.
- **AC7** — GIVEN due, unannounced reviews THEN the daily cron, after the daily
  suggestion, creates at most one in-app `review_due` notification per learner per UTC
  day (`review:<date>`). During the hackathon release, the `email_review` channel is
  disabled in code regardless of configuration or existing opt-ins; no delivery slot
  is claimed or retried and Resend is never invoked. In-app reminders are always
  active, including for existing opt-outs;
  the daily practice suggestion is unaffected. Email integration and tables remain
  available for future use; Supabase Auth emails are unchanged.
- **AC8** — GIVEN a review has been announced THEN it is marked, and later runs do not
  announce that stage again; completing it advances the stage and clears the mark so
  the next stage is announced once when it falls due. A retry never re-sends a review
  that was completed or rescheduled in the meantime.
- **AC9** — GIVEN a learner THEN they see and are reminded about only their own reviews.
  Notification payloads hold enums, slugs and stage numbers only.
- **AC10** — GIVEN the review table is not migrated yet or fails THEN a submission is
  still saved, the Overview card says reviews are unavailable, and the failure is
  reported rather than swallowed silently.

## Data / API

- `ProblemReview` (`prisma/schema/reviews.prisma`, table `problem_reviews`): primary key
  `(userId, problemSlug)`; `reviewsDone` 0–3; `dueDay` (UTC date); `enrolledAt`,
  `lastReviewedAt`, `completedAt`, `remindedAt`. No score, no free text. The create
  migration is CI-generated and must be followed by the hand-written RLS-enable
  migration.
- Pure rules: `src/lib/reviews/` (`review-schedule.ts`, `review-evidence.ts`,
  `review-service.ts`, `review-queries.ts`, `review-reminder.ts`). Prisma wiring:
  `src/server/reviews/reviews.ts`; hook in `saveAttempt`. No new endpoint or action.
- Notifications: `src/server/notifications/review-scheduler.ts` (pure) and
  `review-reminders.ts` (wiring), run from the existing cron route; the bell and the
  email render `review_due` through the shared reminder copy.
- No analytics events.

## Edge cases

- A learner who solves several problems on one day gets several reviews due together;
  the card shows five and a count, and the reminder names three and counts the rest.
- A problem the catalogue no longer has is never listed or announced.
- Before the migration the cron's review pass finds nothing and the card is unavailable.
- Deleting an account cascades its review rows.

## Tests

`src/lib/reviews/*.test.mts`, `src/server/reviews/reviews.test.mts`,
`src/server/notifications/review-scheduler.test.mts`.

## Changelog

- 2026-11-05 — created (Agreed).
