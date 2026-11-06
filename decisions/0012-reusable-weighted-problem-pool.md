# 0012. The Daily Exam draws from a reusable private pool with weighted, recency-aware selection

Date: 2026-11-06
Status: Accepted (Umair, 2026-11-06; teammate sign-off outstanding). Amends 0011 §2 (selection)
and its "inventory" consequence; everything else in 0010 and 0011 stands.

## Context

ADR-0011 picked a random problem among those never used, and cancelled the exam once none were
left. With seven problems that stops the exam after a week and makes authoring a new unique
problem every day a standing human duty. The product owner does not want that duty: problems may
repeat, chosen so that recent and frequently used ones are less likely.

A repeated problem is no longer unseen. After its first exam it was published for Practice, where
the statement, Tracy, hints and the learner's own earlier solutions are available. That affects
fairness during the exam, the honesty of the labels, and when learning credit can safely be written.

## Decision

1. **Reusable pool, selected at opening.** At opening, one conditional write both opens the exam
   and stores its problem. The choice is never recomputed: `status = scheduled AND problemId IS
NULL` is the write's condition, so a retry, a concurrent opener or a later pool change can never
   alter an exam's problem. History is the record: each problem's prior appearances and last-used
   date are derived from `daily_exams`, the one source of truth.
2. **Eligibility with progressive cooldown.** Candidates are `eligible` problems (not retired). With
   `daysSince` = days since the problem's last exam (∞ if never used):
   - try a 7-day cooldown (`daysSince > 7`), then relax one day at a time down to 1 (excludes only
     yesterday's problem), taking the first non-empty set;
   - with at least two eligible problems the 1-day floor always leaves a candidate, so yesterday's
     problem is never repeated;
   - with exactly one eligible problem it is used (cooldown 0) and labelled a repeat;
   - the exam is cancelled (`no_problem`, visible, alerted) **only** when no eligible problem exists.
3. **Weighted choice with secure randomness.** `weight = (1 + min(daysSince, 30)) / (1 + 3 ×
priorUses)` (versioned `selection@1`; a never-used problem has weight 31). It is converted to integer
   micro-weights over candidates ordered by id, and one is drawn with `crypto.randomInt` on the server.
   The cooldown applied, candidate count, weights and draw are stored with the exam for audit.
4. **Repeats are labelled honestly.** An exam whose problem appeared before is a **repeat**: once open,
   its page says "This problem has appeared in a previous exam and is available in Practice", and its
   leaderboard is marked "Repeat problem". The product never claims a repeat is unseen. Before opening,
   nothing reveals which problem today's is, repeat or not.
5. **Practice of the exam's problem is locked while it is examined.** From `opensAt` until that exam's
   learning credit is written, `/practice/<slug>`, Tracy, hints and solution history for that problem
   are unavailable (server-checked), with "This problem is in today's exam". The lock starts at opening,
   never before, so it reveals nothing early. A page loaded before 15:00 can still run code in the
   browser; that limitation is disclosed.
6. **Credit timing.** A first-use problem is credited at next-day publication (unchanged, it was
   secret). A repeat is credited when results publish, since nothing about it is secret. Either way it
   is dated at the submission and fenced exactly once, and the Practice lock means no Practice pass on
   the problem can precede the exam credit, which keeps M9C ordering intact.

## Alternatives considered

- **Never reuse.** Turns problem authoring into a daily duty.
- **Uniform random with a cooldown.** Ignores frequency: a small pool would repeat some problems far
  more than others.
- **Round-robin.** Predictable, so participants could know tomorrow's problem.
- **Denormalised `timesUsed` / `lastUsedOn` columns.** They can drift from history. Deriving them
  from `daily_exams` (indexed) cannot.
- **Locking Practice before opening.** It would reveal today's problem to everyone.

## Consequences

- `daily_exams.problemId` is no longer unique. An index on (`problemId`, `examDate`) serves the
  history query.
- The "fewer than 7 problems remain" alert goes. An informational alert fires when the cooldown had to
  relax below 7 days (the pool is small), and an error alert when the pool is empty.
- The standing duty to author a problem a day disappears. A larger pool still means fewer and less
  frequent repeats, which is worth growing over time but is never required.
- Repeat exams are weaker competitions, because a participant may have practised the problem, and they
  say so.
