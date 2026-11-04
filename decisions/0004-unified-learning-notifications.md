# 0004. Unified learning notifications: in-app + email from one daily scheduler

Date: 2026-11-02
Status: Accepted (Umair; signed off by Asad 2026-11-04)

## Context

ADR-0003 settled that M7 recommendations are deterministic, cached, and that the
daily email cron reads or recomputes them without calling a model. M7.5B adds a
second reminder channel — a persistent in-app notification inbox (the bell in
the header) — and the question is how the two channels relate:

- They must not disagree (an email saying "continue Two Sum" while the bell says
  "try Contains Duplicate").
- Each must be independently switchable by the learner, and email must be an
  explicit opt-in.
- Vercel Hobby allows a cron about once a day with a capped function duration,
  and no per-user local send time.
- Web Push is out of scope now but should not need a redesign later.
- New tables must never be reachable by the Supabase `anon`/`authenticated`
  roles, yet CI generates the create-table migration and RLS-enable must be a
  separate, later, hand-written migration (docs/rules/migrations.md).

## Decision

1. **One planner, many channels.** A pure planner
   (`src/lib/learning/reminder-plan.ts`) turns the learner's _current_ M7.3
   recommendation into one small, enum-only `ReminderPlan` (template, problem
   slug, reason code, concept tag, days inactive). Every channel renders from that
   same plan with the same copy function, so they cannot disagree. The planner
   never re-ranks and returns nothing for a problem the catalog doesn't have.
2. **One daily scheduler** (`GET /api/cron/learning-reminders`, `CRON_SECRET`,
   one UTC schedule in `vercel.json`) runs every channel for every eligible
   learner. It uses the deterministic recommendation read path (cache reused,
   never OpenRouter) and never runs Python.
3. **In-app notifications are rows, not events.** `learning_notifications` holds
   one row per learner per logical key (`daily:<UTC date>`), unique on
   `(userId, logicalKey)` and inserted with `ON CONFLICT DO NOTHING`, so duplicate
   and concurrent runs create it once. The payload is the plan (enums), rendered
   into words at display time — no free text stored. Notifications are created
   only by the scheduler, never on submissions or test failures.
4. **External channels share a delivery ledger.** `notification_deliveries` is
   keyed `(userId, deliveryDate, channel)`; `channel` is `'email'` today and
   `'push'` later. A slot is claimed by an atomic insert or a conditional
   reclaim (retryable, or a crashed claim past its TTL), attempts are bounded,
   and the provider gets a stable idempotency key, so a crash between "provider
   accepted" and "we recorded it" doesn't double-send. The first claim freezes
   the planned reminder into the slot and every retry re-sends that copy, so one
   key never carries two payloads. The claim TTL (10 min) is far above the cron's
   maximum duration (60 s), so a live claim is never mistaken for a crashed one. We record _accepted_,
   never _delivered_.
5. **Preferences are per channel and independent.** `notification_preferences`:
   in-app defaults ON (low intrusion), email defaults OFF (explicit opt-in). The
   row carries a 256-bit random unsubscribe token that can only turn email off.
6. **Sending requires an operator declaration**, not just a key: Resend key +
   `REMINDER_FROM_EMAIL` + `RESEND_VERIFIED_DOMAIN`, with the sender's domain
   equal to the declared verified domain. A key in a developer's `.env.local`
   alone never sends.
7. **RLS ordering.** CI's generated `CREATE TABLE` migration and the hand-written
   `ENABLE ROW LEVEL SECURITY` migration ship in the same PR and are applied by
   the same `prisma migrate deploy` run, in that order. The window between them is
   a single migration boundary, during which the tables are empty and the Data API
   is off (docs/rules/auth.md), so no anonymous path exists. `pnpm check:rls`
   keeps the PR red until the RLS migration exists, and AGENTS.md forbids merging
   red. The RLS migration cannot be committed first: CI replays committed
   migrations before generating, and an `ALTER TABLE` on a missing table fails.

## Alternatives considered

- **Separate cron per channel.** Two schedules (Hobby's maximum) for one daily
  decision, two places to keep consistent, and channels free to drift. Rejected;
  the second Hobby slot is kept free for a possible same-day "sweep" re-run.
- **Store rendered notification text.** Simpler reads, but copy edits would need a
  data migration and free text would sit in the table. Rejected for an enum plan.
- **Notify on every submission / failure.** Noisy, and it would turn a learning
  aid into nagging. Rejected; one daily reminder at most per channel.
- **HMAC-derived unsubscribe tokens (no stored token).** No secret at rest, but a
  new signing secret to provision and rotate. Rejected in favour of a stored
  random token, which needs nothing new and is equally unguessable.
- **A Postgres event trigger that enables RLS on every `CREATE TABLE`** (closes the
  ordering window completely). Worth considering later, but it is a broader
  infrastructure change than this milestone, and the migration rules sanction only
  `ALTER TABLE … ENABLE ROW LEVEL SECURITY` as hand-written SQL. Recorded here as
  the follow-up if the window ever matters (for example, if the Data API is
  turned on).

## Consequences

- Adding Web Push later is a new `channel` value, a subscription table, and a
  sender — the planner, scheduler loop, ledger, and preferences pattern stay.
- One daily invocation bounds throughput: a run stops _starting_ learners at its
  budget (45 s / 300 learners) and reports `truncated`. It is idempotent and skips
  finished learners, so any later invocation the same UTC day continues the work —
  but on Hobby that second invocation must be added deliberately (a second cron
  entry or a manual call). Beyond that, learners at the end of the rotated list
  wait until the next day. Pro (longer duration, more frequent cron) removes it.
- No local-time delivery is promised; the reminder lands at one fixed UTC hour.
- The scheduler now writes `recommendation_cache` rows for every learner it plans
  (deterministic, reused by `/progress`).
