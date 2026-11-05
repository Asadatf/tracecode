// HIDDEN grading suites for the daily challenge (specs/features/daily-challenge.md,
// ADR-0007). These are the ONLY expected answers used for competitive scoring.
//
// They are deliberately separate from the practice tests in src/lib/trace/catalog/*,
// which are public (they ship to every browser with the practice workspace). A hidden
// case's `args` go into the sandbox; its `expected` NEVER does — the server compares the
// sandbox's outputs against these locally (src/server/challenge/grade.ts).
//
// This file is plain data with no imports so the unit tests can load it. It must only
// ever be imported by code under src/server/ (the `hidden-suites.ts` wrapper is
// `server-only`); a test fails the build if anything under src/components, src/app/**/page
// files or src/lib imports it.
//
// STATUS: drafted for review. Competitive scoring stays disabled until these suites
// have been read and approved (see ADR-0007). Each suite was cross-checked against the
// verified reference solutions in src/lib/trace/reference-solutions.ts, including the
// deliberately non-compliant ones, which must fail.

export interface HiddenCase {
	id: string
	args: unknown[]
	expected: unknown
}

export interface HiddenSuite {
	cases: HiddenCase[]
}

const n = (count: number, f: (i: number) => number): number[] =>
	Array.from({ length: count }, (_, i) => f(i))
const c = (id: string, args: unknown[], expected: unknown): HiddenCase => ({ id, args, expected })

// two_sum(nums, target) -> [i, j], i < j. Every input has exactly one solution.
const TWO_SUM: HiddenCase[] = [
	c('h1', [[5, 1, 9, 12], 21], [2, 3]),
	c('h2', [[8, -2, 6, 14], 12], [1, 3]),
	c('h3', [[-5, -3], -8], [0, 1]),
	c('h4', [[-3, 4, 3, 90], 0], [0, 2]),
	c('h5', [[0, 4, 3, 0], 0], [0, 3]),
	c('h6', [[-1, -2, -3, -4, -5], -8], [2, 4]),
	c('h7', [[1, 5, 5, 11], 10], [1, 2]),
	c('h8', [[10, -10], 0], [0, 1]),
	c('h9', [[1, 6, 142, 2, 9, 4], 11], [3, 4]),
	c('h10', [[5, 75, 25], 100], [1, 2]),
	// 1..2000 sums to 3999 only as 1999 + 2000 (indices 1998, 1999).
	c('h11', [n(2000, (i) => i + 1), 3999], [1998, 1999]),
	// Same shape, answer at the front: 1 and 2 are the only pair summing to 3.
	c('h12', [n(2000, (i) => i + 1), 3], [0, 1])
]

// contains_duplicate(nums) -> bool.
const CONTAINS_DUPLICATE: HiddenCase[] = [
	c('h1', [[42, 42, 42]], true),
	c('h2', [[1]], false),
	c('h3', [[5, 4, 3, 2, 1, 5]], true),
	c('h4', [[10, 20, 30, 40, 50, 60]], false),
	c('h5', [[-7, -7]], true),
	c('h6', [[0, 0]], true),
	c('h7', [[-1, -2, -3, -1]], true),
	c('h8', [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10]], true),
	c('h9', [[1000000, -1000000, 0]], false),
	c('h10', [n(5000, (i) => i)], false),
	c('h11', [[...n(5000, (i) => i), 0]], true),
	c('h12', [n(5000, () => 7)], true),
	c('h13', [[]], false)
]

// is_anagram(s, t) -> bool.
const VALID_ANAGRAM: HiddenCase[] = [
	c('h1', ['dusty', 'study'], true),
	c('h2', ['night', 'thing'], true),
	c('h3', ['abc', 'abd'], false),
	c('h4', ['aabbcc', 'abcabc'], true),
	c('h5', ['aaab', 'aabb'], false),
	c('h6', ['xy', 'yy'], false),
	c('h7', ['dormitory', 'dirtyroom'], true),
	c('h8', ['stop', 'pots'], true),
	c('h9', ['zz', 'z'], false),
	c('h10', ['a'.repeat(2500) + 'b'.repeat(2500), 'b'.repeat(2500) + 'a'.repeat(2500)], true),
	c('h11', ['a'.repeat(5000), 'a'.repeat(4999) + 'b'], false),
	c('h12', ['ab'.repeat(2500), 'ba'.repeat(2500)], true)
]

// move_zeroes(nums) mutates nums in place; the judged value is nums AFTER the call.
const MOVE_ZEROES: HiddenCase[] = [
	c('h1', [[0, 0, 5]], [5, 0, 0]),
	c('h2', [[9, 0]], [9, 0]),
	c('h3', [[1]], [1]),
	c('h4', [[0, 0, 0]], [0, 0, 0]),
	c('h5', [[3, 2, 1]], [3, 2, 1]),
	c('h6', [[0, 8, 0, 0, 9]], [8, 9, 0, 0, 0]),
	c('h7', [[1, 0, 1]], [1, 1, 0]),
	c('h8', [[-1, 0, -2, 0]], [-1, -2, 0, 0]),
	c('h9', [[4, 2, 0, 1, 0, 3, 0]], [4, 2, 1, 3, 0, 0, 0]),
	c(
		'h10',
		[n(3000, () => 0)],
		n(3000, () => 0)
	),
	// 2500 alternating 0,1 values become 2500 ones... then zeros, order preserved.
	c('h11', [n(5000, (i) => i % 2)], [...n(2500, () => 1), ...n(2500, () => 0)]),
	c(
		'h12',
		[n(4000, (i) => (i % 4 === 0 ? 0 : i))],
		[...n(3000, (i) => i + 1 + Math.floor(i / 3)), ...n(1000, () => 0)]
	)
]

// search(nums, target) -> index or -1. nums is sorted, distinct.
// Sorted, distinct, 10,000 values: large enough to be a real search, small enough that the
// whole suite stays a modest job (the inputs, not the answers, are what is sent).
const evens = n(10000, (i) => i * 2)
const BINARY_SEARCH: HiddenCase[] = [
	c('h1', [[2, 4, 6, 8, 10, 12, 14], 10], 4),
	c('h2', [[2, 4, 6, 8, 10, 12, 14], 7], -1),
	c('h3', [[-10], -10], 0),
	c('h4', [[5], 4], -1),
	c('h5', [[10, 20, 30], 20], 1),
	c('h6', [[10, 20, 30], 30], 2),
	c('h7', [[1, 3, 5, 7, 9], 1], 0),
	c('h8', [[1, 3, 5, 7, 9], 9], 4),
	c('h9', [[1, 3, 5, 7, 9], 0], -1),
	c('h10', [[1, 3, 5, 7, 9], 10], -1),
	c('h11', [evens, 19998], 9999),
	c('h12', [evens, 19999], -1)
]

// is_valid(s) -> bool.
const VALID_PARENTHESES: HiddenCase[] = [
	c('h1', ['[]'], true),
	c('h2', ['{}()'], true),
	c('h3', ['(}'], false),
	c('h4', ['[({})]'], true),
	c('h5', ['{(})'], false),
	c('h6', ['['], false),
	c('h7', [']'], false),
	c('h8', ['()('], false),
	c('h9', ['}{'], false),
	c('h10', ['{[()]}[]'], true),
	c('h11', ['('.repeat(1000) + ')'.repeat(1000)], true),
	c('h12', ['('.repeat(1000) + ')'.repeat(999)], false),
	c('h13', ['()[]{}'.repeat(500)], true)
]

export const HIDDEN_SUITES: Record<string, HiddenSuite> = {
	'two-sum': { cases: TWO_SUM },
	'contains-duplicate': { cases: CONTAINS_DUPLICATE },
	'valid-anagram': { cases: VALID_ANAGRAM },
	'move-zeroes': { cases: MOVE_ZEROES },
	'binary-search': { cases: BINARY_SEARCH },
	'valid-parentheses': { cases: VALID_PARENTHESES }
}

// The problems that may be a daily challenge: exactly those with a hidden suite.
export const ELIGIBLE_SLUGS: readonly string[] = Object.keys(HIDDEN_SUITES)
