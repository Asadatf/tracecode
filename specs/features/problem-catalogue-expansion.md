# Feature: Problem catalogue expansion (6 → 16 problems)

Status: Agreed (Umair; no teammate sign-off)
Owner: Umair
Related: `specs/features/curated-problem-pack.md` (the previous four), `specs/02-trace-contract.md`
(unchanged), `specs/features/practice-trace-condensing.md` (visible tests, folding),
`specs/features/daily-challenge.md` (eligibility), `specs/features/spaced-review.md`

## Why

Six problems were too few for recommendations, reviews and the daily challenge to say much about
a learner. This is a content milestone: ten more problems, each using the existing system
(registry, starter, grading modes, tests, reference solutions, tracing, Tracy knowledge). No new
infrastructure, tables, routes or AI models.

## Acceptance criteria

- **AC1** — The catalogue holds 16 problems with unique stable slugs; the ten new ones are
  `valid-palindrome`, `reverse-string`, `maximum-subarray`, `best-time-to-buy-and-sell-stock`,
  `merge-two-sorted-arrays`, `first-unique-character`, `missing-number`, `majority-element`,
  `longest-common-prefix`, `climbing-stairs`. The original six are unchanged.
- **AC2** — Each new problem has a valid `ProblemDefinition`, a type-hinted non-solving starter that
  runs, 8–12 tests, a 5–6 case visible teaching set (`visibleTestIds`; the rest are validation
  checks whose failures stay visible), correctness hints, an optional optimization ladder, known
  strategies, and curated Tracy knowledge (`problem-knowledge.ts`).
- **AC3** — Every `expected` value agrees with an independent oracle (`oracles.mts`). Every compliant
  reference solution (a straightforward and an optimized variant) passes every test in CPython and
  in real Pyodide, and at least three deliberately wrong beginner solutions per problem are
  rejected. Wrong solutions are also caught by the visible teaching set.
- **AC4** — In-place problems (`reverse-string`, `merge-two-sorted-arrays`) are `mutate-arg`: they are
  judged on the argument after the call, never on the return value.
- **AC5** — Replays of the new solutions show the real changes (pointers, swaps, running values,
  frequency tables, the write index, the DP pair), and folding never hides the first or last step,
  an exception, or a state change.
- **AC6** — Concept tags use the existing ids where they exist (`strings`, `arrays`, `two-pointers`,
  `hashing`) and add three: `dynamic-programming`, `greedy`, `math`. Recommendations, the
  Practice list, attempts, streaks, spaced reviews and profiles use them through the existing,
  catalogue-driven code.
- **AC7** — **Daily Challenge eligibility is unchanged:** only problems with a server-only hidden suite
  are eligible, and the ten new problems have none, so they are Practice-only. Pinned dates are
  never remapped. (Authoring and verifying their hidden suites is future work.)

## The ten problems

All use snake_case entries like the existing problems. "Visible" is the teaching set size.

| Slug                              | Entry                         | Difficulty | Tags                        | Tests (visible) | Grading        |
| --------------------------------- | ----------------------------- | ---------- | --------------------------- | --------------- | -------------- |
| `valid-palindrome`                | `is_palindrome(s)`            | easy       | strings, two-pointers       | 12 (6)          | return         |
| `reverse-string`                  | `reverse_string(s)`           | easy       | strings, two-pointers       | 10 (6)          | mutate `s`     |
| `maximum-subarray`                | `max_sub_array(nums)`         | medium     | arrays, dynamic-programming | 11 (6)          | return         |
| `best-time-to-buy-and-sell-stock` | `max_profit(prices)`          | easy       | arrays, greedy              | 10 (6)          | return         |
| `merge-two-sorted-arrays`         | `merge(nums1, m, nums2, n)`   | easy       | arrays, two-pointers        | 10 (6)          | mutate `nums1` |
| `first-unique-character`          | `first_uniq_char(s)`          | easy       | strings, hashing            | 11 (6)          | return         |
| `missing-number`                  | `missing_number(nums)`        | easy       | arrays, math                | 10 (6)          | return         |
| `majority-element`                | `majority_element(nums)`      | easy       | arrays, hashing             | 10 (6)          | return         |
| `longest-common-prefix`           | `longest_common_prefix(strs)` | easy       | strings                     | 11 (6)          | return         |
| `climbing-stairs`                 | `climb_stairs(n)`             | easy       | dynamic-programming         | 8 (6)           | return         |

### Contracts

- **Valid Palindrome** — `s` is printable ASCII, up to 2,000 characters. Only ASCII letters and
  digits count (underscores and everything else are skipped), case is ignored, and `""`, `" "` or
  punctuation only is a palindrome. Returns a bool. Examples: `"A man, a plan, a canal: Panama"` →
  `True`, `"race a car"` → `False`, `" "` → `True`.
- **Reverse String** — `s` is a list of single characters (up to 1,000). Reverse it in place; return
  nothing. `["h","e","l","l","o"]` → `["o","l","l","e","h"]`.
- **Maximum Subarray** — `nums` has 1–1,000 integers in [−10⁴, 10⁴]. The run is contiguous and
  non-empty, so an all-negative input returns its largest value. `[-2,1,-3,4,-1,2,1,-5,4]` → `6`.
- **Best Time to Buy and Sell Stock** — up to 1,000 prices in [0, 10⁴]. Sell strictly after buying;
  return `0` if no profit or fewer than two days. `[7,1,5,3,6,4]` → `5`, `[7,6,4,3,1]` → `0`.
- **Merge Two Sorted Arrays** — `nums1` has length `m + n` (first `m` valid, last `n` zero
  placeholders), `nums2` has `n` sorted values, `m, n ≤ 500`. Merge into `nums1` in place.
  `[1,2,3,0,0,0], 3, [2,5,6], 3` → `nums1 == [1,2,2,3,5,6]`.
- **First Unique Character** — lowercase letters only, up to 5,000; the empty string gives `-1`.
  `"loveleetcode"` → `2`, `"aabb"` → `-1`.
- **Missing Number** — `n` distinct integers from `0..n`, exactly one missing; `[]` → `0`.
  `[3,0,1]` → `2`, `[9,6,4,2,3,5,7,0,1]` → `8`.
- **Majority Element** — non-empty, a value appearing more than `n // 2` times always exists.
  `[3,2,3]` → `3`, `[2,2,1,1,1,2,2]` → `2`.
- **Longest Common Prefix** — up to 200 lowercase strings of up to 500 characters; `[]` and empty
  strings are allowed. `["flower","flow","flight"]` → `"fl"`, `["dog","racecar","car"]` → `""`.
- **Climbing Stairs** — `1 ≤ n ≤ 35`, steps of 1 or 2. `1`→1, `2`→2, `3`→3, `5`→8. Tests stop at
  `n = 30` so a plain recursion still finishes in the 5 s budget.

## Trade-offs and limits

- Growth rates of the new reference solutions are documented, not measured (the measuring test
  covers the original four); correctness is checked on every test in both runtimes.
- Larger validation inputs are kept small (≤ 1,000–5,000 elements) for Pyodide and the 2,000-step
  trace cap.
- `climb_stairs` with plain exponential recursion is still correct but slow near `n = 30`.
- The three new tag ids appear in the existing recommendation and Practice-list code only through
  the generic tag display (`Dynamic-programming`).

## Tests

`src/lib/trace/catalog-expansion.test.mts`, plus the existing catalogue, replay, tutor-knowledge and
challenge tests, updated for 16 problems and for hidden-suite eligibility.

## Changelog

- 2026-11-05 — created.
