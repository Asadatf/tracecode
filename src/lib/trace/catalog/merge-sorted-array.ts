import { type ProblemDefinition } from '../problem'

// LeetCode 88 contract: nums1 has length m + n (the last n slots are 0
// placeholders), 0 ≤ m, n, values within ±10⁹, both lists sorted ascending.
// Judged in place on nums1. The large tests use 5 000 values on each side.
const HALF = 5000
const BIG = 1_000_000_000

const evens = Array.from({ length: HALF }, (_, i) => i * 2)
const odds = Array.from({ length: HALF }, (_, i) => i * 2 + 1)
const interleavedExpected = Array.from({ length: HALF * 2 }, (_, i) => i)
const placeholders = (count: number) => Array.from({ length: count }, () => 0)

export const mergeSortedArray = {
	slug: 'merge-sorted-array',
	title: 'Merge Sorted Array',
	entry: 'merge',
	params: [{ name: 'nums1' }, { name: 'm' }, { name: 'nums2' }, { name: 'n' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'two-pointers'],
	statement: [
		'nums1 and nums2 are lists sorted in ascending order. The first m values of nums1 are real; its last n slots are 0 placeholders, so nums1 has room for both lists. nums2 has n values.',
		'Merge nums2 into nums1 so that nums1 holds all m + n values in ascending order. Do this in place: change nums1 itself and return nothing.'
	],
	examples: [
		{ args: [[1, 2, 3, 0, 0, 0], 3, [2, 5, 6], 3], output: [1, 2, 2, 3, 5, 6] },
		{ args: [[1], 1, [], 0], output: [1] },
		{ args: [[0], 0, [1], 1], output: [1] }
	],
	starter:
		'def merge(nums1: list[int], m: int, nums2: list[int], n: int) -> None:\n    # Put all m + n values into nums1, in ascending order. Change nums1 in place.\n    pass',
	// Judged on nums1 after the call, not on the return value (grading.ts).
	grading: { mode: 'mutate-arg', argIndex: 0 },
	tests: [
		{ id: 't1', args: [[1, 2, 3, 0, 0, 0], 3, [2, 5, 6], 3], expected: [1, 2, 2, 3, 5, 6] },
		{ id: 't2', args: [[1], 1, [], 0], expected: [1] },
		{ id: 't3', args: [[0], 0, [1], 1], expected: [1] },
		{ id: 't4', args: [[4, 5, 6, 0, 0, 0], 3, [1, 2, 3], 3], expected: [1, 2, 3, 4, 5, 6] },
		{ id: 't5', args: [[1, 2, 3, 0, 0, 0], 3, [4, 5, 6], 3], expected: [1, 2, 3, 4, 5, 6] },
		{ id: 't6', args: [[2, 0], 1, [1], 1], expected: [1, 2] },
		{ id: 't7', args: [[1, 1, 0, 0], 2, [1, 1], 2], expected: [1, 1, 1, 1] },
		{ id: 't8', args: [[-5, 0, 5, 0, 0], 3, [-6, 6], 2], expected: [-6, -5, 0, 5, 6] },
		{ id: 't9', args: [[0, 0, 0], 0, [1, 2, 3], 3], expected: [1, 2, 3] },
		{ id: 't10', args: [[1, 4, 7, 0, 0, 0], 3, [2, 5, 8], 3], expected: [1, 2, 4, 5, 7, 8] },
		{ id: 't11', args: [[3, 0, 0], 1, [1, 2], 2], expected: [1, 2, 3] },
		{ id: 't12', args: [[1, 2, 0], 2, [3], 1], expected: [1, 2, 3] },
		{ id: 't13', args: [[-1, 0, 0, 0], 1, [-3, -2, -1], 3], expected: [-3, -2, -1, -1] },
		{ id: 't14', args: [[0, 0], 1, [0], 1], expected: [0, 0] },
		{ id: 't15', args: [[-BIG, BIG, 0], 2, [0], 1], expected: [-BIG, 0, BIG] },
		{
			id: 't16',
			args: [[0, 0, 3, 0, 0, 0, 0], 3, [-1, 1, 1, 4], 4],
			expected: [-1, 0, 0, 1, 1, 3, 4]
		},
		{
			id: 't17',
			args: [[...evens, ...placeholders(HALF)], HALF, odds, HALF],
			expected: interleavedExpected
		},
		{
			id: 't18',
			args: [[...odds, ...placeholders(HALF)], HALF, evens, HALF],
			expected: interleavedExpected
		},
		{
			id: 't19',
			args: [placeholders(HALF * 2), 0, interleavedExpected, HALF * 2],
			expected: interleavedExpected
		},
		{ id: 't20', args: [interleavedExpected, HALF * 2, [], 0], expected: interleavedExpected }
	],
	arrayVar: 'nums1',
	pointerVars: [
		['i', 'nums1'],
		['j', 'nums2'],
		['k', 'nums1'],
		['p1', 'nums1'],
		['p2', 'nums2'],
		['write', 'nums1']
	],
	correctnessHints: [
		'Compare nums1 after the call (not the return value) with the expected list. Are values missing, out of order, or is a 0 placeholder still there?',
		'The caller is judged on the same nums1 list it passed in. Building a new list, or rebinding the name nums1, leaves the original untouched. Real zeros in the data are values, not placeholders: only the slots after the first m are free.',
		'Change the elements of nums1 itself: assign to its indexes or to a full slice. One way is to copy nums2 into the free slots and then put nums1 back in order.'
	],
	optimization: {
		title: 'Optional: merge without sorting again',
		goal: 'Your solution passes. As an optional exercise, use the fact that both lists are already sorted, and fill nums1 without sorting it or making a copy.',
		hints: [
			'Sorting the combined list ignores that both halves were already in order, and a merged copy needs extra memory the size of the input.',
			'The largest remaining value is always at the end of one of the two lists, and the free slots are at the end of nums1, so filling from the back never overwrites a value you still need.',
			'Keep one index at the last real value of nums1, one at the end of nums2, and one at the last slot of nums1. Copy the larger of the two values into the slot and move those indexes left until nums2 is used up.'
		]
	},
	knownStrategies: [
		{ name: 'Copy in, then sort', time: 'O((m + n) log(m + n))', space: 'O(m + n)' },
		{ name: 'Three pointers from the back', time: 'O(m + n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
