# Feature: Curated problem pack — Valid Anagram, Move Zeroes, Binary Search, Valid Parentheses

Status: In progress (scope agreed in the 2026-11-02 task brief; no teammate sign-off yet). Extended to 16 problems by `problem-catalogue-expansion.md`.
Owner: Umair
Related: `specs/00-product.md`, `specs/02-trace-contract.md` (unchanged — see § Judging in-place problems), `specs/features/fail-and-replay.md`, `specs/features/learning-recommendations.md`

## Why

The catalog had two problems, too few for M6/M7 to say anything about a
learner across topics. This adds four easy problems, each with a straightforward
and an optimized solution, so a learner can first make something correct and then,
only after every official test passes, choose to look for avoidable work. The
optimization step teaches; it never grades the learner's complexity.

## User stories

- As a learner, I want to solve Valid Anagram, Move Zeroes, Binary Search and
  Valid Parentheses in the same workspace as the existing problems.
- As a learner who is stuck, I want observation → reasoning → strategy hints about
  the specification, without being given code.
- As a learner who has solved a problem, I want an optional challenge that asks
  whether I can avoid sorting / extra storage / scanning / rescanning, and I want
  my original solution kept no matter what I try next.

## Acceptance criteria

- **AC1** — GIVEN the catalog WHEN listed THEN `valid-anagram`, `move-zeroes`,
  `binary-search`, `valid-parentheses` exist beside the original two, each with a
  valid `ProblemDefinition`, `/practice/<slug>` resolves, and the picker lists all
  six. (`catalog.test.mts`, `e2e/practice-catalog.spec.ts`)
- **AC2** — GIVEN each problem's official tests WHEN checked THEN every input is
  inside the problem's stated constraints and every `expected` agrees with an
  independent TypeScript oracle. (`catalog.test.mts`)
- **AC3** — GIVEN each problem WHEN its reference solutions run THEN every
  compliant straightforward and optimized variant passes every official test, in
  CPython and in real Pyodide, and a noncompliant baseline is rejected.
  (`catalog.test.mts`)
- **AC4** — GIVEN the reference solutions WHEN measured THEN their stated growth
  holds (line events and tracemalloc peaks at doubling sizes), independent of the
  AST heuristics. (`reference-solutions.test.mts`)
- **AC5** — GIVEN the compliant references and generated valid inputs (400 per
  problem) WHEN all run THEN they agree with each other and the oracle.
  (`grading.test.mts`)
- **AC6** — GIVEN plausible-but-wrong approaches WHEN graded THEN each fails at
  least one official test. (`grading.test.mts`)
- **AC7** — GIVEN Move Zeroes WHEN graded THEN it is judged on `nums` after the
  call; a returned _new_ list fails with a not-in-place message, rebinding `nums`
  fails, an in-place solution passes (returning the same list is tolerated).
  (`grading.test.mts`, e2e)
- **AC8** — GIVEN a failed replay and a still-failing resubmission WHEN guidance
  is offered THEN an evidence-based diagnosis with three levels
  (observation, reasoning, strategy) is shown, falling back to the problem's own
  correctness ladder rather than a guess. (`catalog-teaching.test.mts`)
- **AC9** — GIVEN every official test has passed once WHEN the learner continues
  THEN an optional optimization challenge is shown with hints revealed one at a
  time (each reveal recorded as `hint_revealed`, detail `optimise-<slug>:L<n>`);
  it makes no complexity claim and never labels the solution brute-force or
  optimized from AST counts. (`catalog-teaching.test.mts`, e2e)
- **AC10** — GIVEN a solved problem WHEN the learner submits a failing attempt
  THEN the problem stays solved, the challenge stays, and "Restore my solved
  code" reloads the first passing source. Every Run is an ordinary saved attempt.
  (`catalog-teaching.test.mts`, e2e)
- **AC11** — GIVEN each reference solution WHEN replayed on real Pyodide THEN the
  trace is schema-valid, ≤ the step cap, flagged `truncated` on large inputs, and
  pointers, dictionary changes, array mutations and stack pushes/pops appear only
  where the trace contains them. (`catalog-replay.test.mts`)
- **AC12** — GIVEN the full catalog WHEN M6 statistics, M7.2 evidence, M7.3 ranking,
  the M7.4 slug guard and the M7.5B reminder planner run THEN the new problems are
  handled, ranking is deterministic, only catalog problems are recommended, and
  existing learner records are unaffected. (`catalog-integration.test.mts`)

## Data / API

- **No schema, migration, API, analytics-taxonomy or trace-contract change.**
  Everything is catalog data (`src/lib/trace/catalog/*.ts`) plus optional fields
  on `ProblemDefinition`: `grading`, `correctnessHints`, `optimization`.
- **Judging in-place problems.** The run program only compares an entry's _return
  value_ with `expected`. For `grading: { mode: 'mutate-arg', argIndex }`,
  `buildRunRequest` (`src/lib/trace/grading.ts`) appends a small harness to the
  learner's source and uses it as the entry; the harness calls the learner's
  function and returns the argument afterwards (or a message if a _different_
  object was returned). `RunRequest`, `RUN_PROGRAM`, the worker and the tests'
  `expected` shape are untouched; appending keeps learner line numbers. Replays
  trace the learner's own function. Saved attempts store the learner's source,
  not the harness.
- **Decision — extra-array Move Zeroes.** Building a temporary list and writing it
  back (`nums[:] = …`) _is_ accepted: it satisfies the contract and is the
  educational baseline. Returning a new list is the noncompliant baseline and is
  rejected with a targeted diagnosis. Which one is cheaper in memory is what the
  optional challenge asks about — grading does not.
- **Hidden tests are not supported.** `testCaseSchema` has no hidden flag and the
  workspace lists every test; adding one is a trace/run-contract and UI change
  that this milestone does not make. All tests are curated and visible.
- **Large tests** are generated deterministically in source (not stored as
  literals) and kept within Pyodide's 5 s run budget: 20 000-character anagram
  strings, 10 000-element arrays/strings, ≤ 2 000-deep nesting for the quadratic
  baseline. The practice page passes only the slug; the client resolves the
  problem, so test data is never serialized into the page payload.

## Edge cases

- Empty / first-time state: the challenge never shows before a full pass.
- Errors and timeouts: an infinite loop times out the whole run (existing
  behaviour); a missing entry function reports `entry_not_found` even for the
  harness-graded problem.
- Existing problems: Two Sum and Contains Duplicate keep their AST-based
  "nested loops" guidance unchanged (pre-existing, tested). The new problems
  deliberately have no such rule.
- M6 note: optimization hint reveals are `hint_revealed` events and are counted by
  the M6 hint statistics alongside correctness hints; their ids start `optimise-`.
- Two attempts that passed are unaffected by anything after them.

## Research dossier

Sources, checked 2026-11-02. LeetCode itself returned HTTP 403 to automated
fetches, so constraints and approaches were verified on the Doocs LeetCode
mirror and NeetCode; the problem statements and all explanations here are
original wording.

### Valid Anagram (LeetCode 242)

- **Sources:** https://leetcode.com/problems/valid-anagram/ ·
  https://neetcode.io/solutions/valid-anagram · https://leetcode.doocs.org/en/lc/242/
- **Contract:** `is_anagram(s: str, t: str) -> bool`. 1 ≤ len(s), len(t) ≤ 5·10⁴;
  lowercase English letters only. (Follow-up: Unicode → use a dictionary, not a
  26-slot array.)
- **Edge cases:** unequal lengths; one-letter strings; same letters, different
  counts (`aab`/`abb`); identical strings; letter-code collisions (`ac`/`bb`);
  full alphabet reversed; 20 000-character inputs.
- **Straightforward:** sort both and compare — O(n log n) time; space depends on the
  sort (Python's `sorted` builds new lists, O(n)).
- **Optimized:** count letters (26-slot array, or dictionary for any alphabet) —
  O(n) time; O(1) auxiliary space for a fixed alphabet (O(k) for k distinct letters
  in a dictionary). Not uniquely optimal: sorting is shorter and perfectly fine
  below large n.
- **Common mistakes:** comparing sets of letters; comparing lengths only; summing
  character codes; counting `t` against `s` without checking lengths; returning a
  non-boolean.
- **Prerequisites:** strings, loops, dictionaries / lists, `ord`.
- **Correctness hints:** (1) compare a failing input — does your code look at how
  many times each letter appears, or only which appear? (2) the same set of
  letters is not enough, and different lengths never match; (3) make the strings
  directly comparable — canonical order, or tally and compare.
- **Optimization hints:** (1) ordering every letter does more than the question
  needs; (2) counting is one pass per string and needs no ordering; (3) tally one
  string and let the other cancel it — a mismatch settles it early.
- **Tests:** 18 (examples, minimal, unequal lengths both ways, count mismatches,
  letter-code collision, full alphabet, 3 large).

### Move Zeroes (LeetCode 283)

- **Sources:** https://leetcode.com/problems/move-zeroes/ ·
  https://neetcode.io/solutions/move-zeroes · https://leetcode.doocs.org/en/lc/283/
- **Contract:** `move_zeroes(nums: list[int]) -> None`, in place. 1 ≤ len ≤ 10⁴;
  −2³¹ ≤ nums[i] ≤ 2³¹ − 1. Non-zero values keep their relative order. Follow-up:
  minimize the total number of operations.
- **Edge cases:** single `0`; single non-zero; all zeros; no zeros; zeros already at
  the end; zeros at the front; 32-bit extremes; negatives; non-sorted non-zeros
  (defeats sorting); 10⁴ alternating / all-zero / zeros-first inputs.
- **Straightforward:** build a list of non-zeros and pad with zeros, writing it back
  into `nums` — O(n) time, O(n) space (accepted). Returning the new list instead
  is _noncompliant_ (rejected).
- **Optimized:** two pointers — a scanning index and a "next non-zero slot" index,
  swapping (or copy then zero-fill) — O(n) time, O(1) space. The swap form skips no
  work when read == write; copy-then-fill minimizes writes. Neither is uniquely
  best for "minimum operations".
- **Common mistakes:** returning a new list; rebinding `nums`; sorting (loses
  order); `pop`/`remove` while indexing; swapping with the last element; forgetting
  to zero-fill.
- **Prerequisites:** lists are mutable and passed by reference; index assignment;
  slice assignment.
- **Correctness hints:** (1) compare the final `nums`, not the return value;
  (2) the caller is judged on the list it passed — a new list or rebinding is
  invisible to it; (3) change the original list's elements, keeping non-zero order.
- **Optimization hints:** (1) a temporary list holds a copy of values already in
  `nums`; (2) a non-zero never moves right, so slots already examined are free to
  overwrite; (3) one scanning index, one slot marker, place and advance, zero the
  tail.
- **Tests:** 19 (judged on `nums` after the call).

### Binary Search (LeetCode 704)

- **Sources:** https://leetcode.com/problems/binary-search/ ·
  https://leetcode.doocs.org/en/lc/704/
- **Contract:** `search(nums: list[int], target: int) -> int`. 1 ≤ len ≤ 10⁴; all
  values and the target in (−10⁴, 10⁴); values unique, ascending. Index or −1.
  LeetCode asks for O(log n); TraceCode accepts any correct approach and offers
  the faster one as the optional challenge.
- **Edge cases:** single element (present / smaller / larger); two elements (both
  positions, between); first and last positions; target below / above everything;
  odd and even lengths; extreme values ±9999; 10⁴-element array.
- **Straightforward:** linear scan — O(n) time, O(1) space.
- **Optimized:** iterative binary search with inclusive `left`/`right` — O(log n)
  time, O(1) space. Recursion is O(log n) space; a half-open window variant is
  equally valid.
- **Common mistakes:** `while left < right` without a final check; `right = len(nums)`
  with `<=`; `left = mid` / `right = mid` that never shrinks (infinite loop →
  timeout); returning the value rather than the index; returning `None`.
- **Prerequisites:** sorted order, integer division, loop invariants.
- **Correctness hints:** (1) which tests fail — ends, absent, single element?
  (2) index not value; −1 only after everything your approach owes has been
  considered; (3) walk one failing test by hand and compare examined indexes with
  the needed one. (Deliberately method-neutral: a correct linear scan must not be
  steered away.)
- **Optimization hints:** (1) scanning ignores the sorted order; (2) one
  comparison with the middle rules out about half of what remains; (3) keep a
  window with two indexes, probe, shrink past the probe, stop when empty — be
  consistent about inclusive ends.
- **Tests:** 25 (first/last, absent, singles, pairs, extremes, 16- and 10⁴-element).

### Valid Parentheses (LeetCode 20)

- **Sources:** https://leetcode.com/problems/valid-parentheses/ ·
  https://neetcode.io/solutions/valid-parentheses · https://leetcode.doocs.org/en/lc/20/
- **Contract:** `is_valid(s: str) -> bool`. 1 ≤ len ≤ 10⁴; characters only `()[]{}`.
- **Edge cases:** single opener / closer; closes too early (`)(`, `))`); unfinished
  (`(`, `(()`); extra closer after a valid prefix (`()]`); crossed (`([)]`, `[(])`);
  mixed kinds; deeply nested valid and invalid; 10⁴ flat characters.
- **Straightforward:** repeatedly delete adjacent matched pairs until nothing is
  left — O(n²) time worst case (deep nesting, one pair per pass), O(n) space.
- **Optimized:** stack of unmatched openers (or expected closers) — O(n) time, O(n)
  space (worst case: all openers).
- **Common mistakes:** counting each kind only; no empty check before `pop`; no
  leftover check at the end; comparing only first and last; one `replace` pass
  rather than repeating; treating any closer as matching.
- **Prerequisites:** strings, loops, last-in-first-out lists, dictionaries.
- **Correctness hints:** (1) classify a failing input — wrong order, too early,
  left open; (2) counting is not enough, a closer must match the most recent open
  opener; (3) decide what to remember about unclosed openers and what to check at
  each closer and at the end.
- **Optimization hints:** (1) restarting after each match re-reads unchanged text;
  (2) only the most recent unmatched opener can match the next closer; (3) one
  left-to-right pass, a last-in-first-out collection, compare and discard,
  nothing left at the end.
- **Tests:** 26 (valid, crossed, early, unfinished, 5 large).

## Tasks

- [x] Catalog entries and optional `ProblemDefinition` fields
- [x] Harness grading for in-place problems (`grading.ts`)
- [x] Reference solutions, oracles, differential and complexity tests
- [x] Evidence-based diagnoses and the post-solve challenge (`teach.ts`, workspace)
- [x] M6/M7 integration test over the full catalog; older M7 tests pin the original two problems
- [x] e2e coverage on real Pyodide

## Changelog

- 2026-11-02 — created and implemented.
