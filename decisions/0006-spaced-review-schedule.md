# 0006. Spaced review: a persisted per-problem schedule with a fixed 1 / 3 / 7 day cycle

Date: 2026-11-05
Status: Accepted (Umair; no teammate sign-off yet)

## Context

M9C brings learners back to problems they have already solved, because daily
practice that returns to earlier work is the product's habit loop. The brief fixes the
shape: review 1 is due a day after a solve, review 2 three days after review 1 is
completed, review 3 seven days after review 2, and "opening a problem, reading an
explanation, or asking Tracy" must never complete a review.

Two things make a design choice necessary:

- **Where the schedule lives.** The streak and the activity graph are _derived_ from
  `Attempt` on each read. A review schedule could be derived the same way (a pure
  function of passing attempts), or stored.
- **How much a pass proves.** The pass/fail a browser reports is telemetry, not
  server-verified grading (ADR-0001). The server never runs learner code.

## Decision

1. **Persist one row per learner and problem** (`problem_reviews`): the number of
   successful reviews (0–3), the UTC due date, and timestamps. `Attempt` stays the
   evidence; the row only remembers the stage. We persist, rather than derive, because
   the feature needs things a derivation cannot give cheaply or safely: an atomic
   "advance at most once" (one conditional UPDATE on the stage the caller saw, so a
   duplicate or concurrent request cannot skip a stage), a stable due date that does
   not change when history is re-read, and an "already announced" mark so a reminder is
   sent once per stage and stops when the review is completed.
2. **Fixed, documented policy; no model.** 1, then 3, then 7 days, counted in UTC days
   from the day the previous review was _successfully_ completed. An unsuccessful
   review changes nothing: it stays due. No score, no mastery estimate, no retention
   claim anywhere in the data or the copy.
3. **Eligibility is forward-looking.** A problem enters the cycle on the learner's first
   qualifying pass after this ships. Problems solved before it are not enrolled, so
   shipping does not create a wall of overdue reviews; solving one again enrols it.
4. **A pass advances a stage only through a consistency gate.** It must be a completed
   run, judged meaningful by the server (not the untouched starter), and its reported
   results must cover every catalogue test exactly once, all passed. A pass before the
   due day changes nothing. This is a gate against accidental and partial reports, not
   proof: a request that fabricates complete results can still advance a review, which
   only server-side grading (M9B) closes. It is documented, not hidden.
5. **Reminders reuse the notification infrastructure, as a separate kind.** Due-review
   reminders use the same two ledgers (`learning_notifications`,
   `notification_deliveries`) under their own kind (`review_due`), key
   (`review:<date>`) and email channel (`email_review`), run in the same cron slot
   after the daily suggestion, and respect the same preferences. They never share a
   slot with, or change, the daily practice suggestion.
6. **The recommendation engine is not changed.** Due reviews appear beside the
   recommendation, labelled, because a due date changes with time and the cached
   recommendation is bound to a hash of the learner's evidence.

## Consequences

- One new table, user-scoped: its create migration is CI-generated and must be followed
  by the hand-written RLS-enable migration (`docs/rules/migrations.md`).
- Review progress cannot be forged by a partial request, but can by a fully fabricated
  one until M9B. The Overview and the copy therefore call a review a scheduled reminder,
  never a measure of memory.
- A learner who ignores reviews accumulates overdue items; the card shows five and a
  count. There is no snooze or dismiss yet.
- Skipped, not decided: lengthening the cycle after review 3, per-topic scheduling, and
  a separate preference for review reminders.
