# Feature: Problem pack 2 (classic beginner problems)

Status: In progress (built 2026-11-03; for Umair to review in the PR)
Owner: Asad
Related: `specs/features/curated-problem-pack.md` (the format these follow),
`specs/00-product.md` (v1 scope: 10–15 problems)

## Why

v1 aims for 10–15 curated problems and there are 6. Every learning feature
(replay, hints, recommendations, plans, solutions) is only as useful as the
problems it runs on. Six more well-known beginner problems, built to the same
standard as Umair's curated pack, bring the catalogue to 12 and cover two
topics it lacks: running totals and simple dynamic programming.

## User stories

- As a learner, I want more problems at the beginner level, so that I can
  practise each topic more than once.

## Acceptance criteria

- **AC1** — GIVEN the registry THEN it contains these six new problems, in
  this order, after the existing six:
  1. `best-time-to-buy-and-sell-stock` — arrays, running-minimum (easy)
  2. `valid-palindrome` — strings, two-pointers (easy)
  3. `maximum-subarray` — arrays, dynamic-programming (medium)
  4. `merge-sorted-array` — arrays, two-pointers, in place (easy)
  5. `majority-element` — arrays, hashing (easy)
  6. `climbing-stairs` — dynamic-programming (easy)
- **AC2** — GIVEN each new problem THEN it has the same parts as the curated
  pack: statement in our own words, 2+ examples, starter code, 15+ tests
  including edge cases and at least one large input that a too-slow approach
  fails within the time limit, three correctness hints, an optimisation
  challenge, and `pointerVars`/`arrayVar` where the replay benefits.
- **AC3** — GIVEN each new problem THEN it has at least one straightforward and
  one optimised reference solution with stated time and space complexity, both
  passing every test in the real engine, with growth verified by measurement
  (the existing `reference-solutions.test.mts` harness).
- **AC4** — GIVEN `merge-sorted-array` THEN it is graded in place
  (`mutate-arg` on `nums1`), like Move Zeroes.
- **AC5** — GIVEN the home page, Problems page, progress page and practice
  picker THEN the new problems appear automatically (they read the registry);
  signed-out visitors can still open only Two Sum.
- **AC6** — GIVEN the statements THEN none is copied from LeetCode; each is
  written in our own words (the problems themselves are classic and not
  owned).

## Data / API

- New files `src/lib/trace/catalog/<slug>.ts`, registered in
  `src/lib/trace/problems.ts`; reference solutions in
  `src/lib/trace/reference-solutions.ts`; worst-case inputs in the
  measurement test.
- No database or analytics changes. Saved progress is keyed by slug, so
  nothing migrates.

## Edge cases

- Large inputs must stay within the engine's run limits (5 s per run) for the
  optimised approach and exceed them for a clearly too-slow one where the
  problem is about speed (best time to buy and sell, maximum subarray).
- Climbing Stairs: n up to 45 so the answer fits in 32 bits, and plain
  recursion times out on the large cases.
- Valid Palindrome: punctuation, mixed case, digits, empty after cleaning.

## Tasks

- [ ] Six catalog files with tests and hints.
- [ ] Reference solutions + worst-case inputs; measurement test passes.
- [ ] Catalog test: every problem's reference solutions pass in Pyodide.
- [ ] Update `curated-problem-pack.md`'s problem count note if it lists them.

## Changelog

- 2026-11-03 — created.
