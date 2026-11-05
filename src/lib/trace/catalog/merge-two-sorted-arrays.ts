import { type ProblemDefinition } from '../problem'

// Contract: nums1 has length m + n; its first m values are sorted and valid and its last n are
// placeholders (0). nums2 has n sorted values. 0 ≤ m, n ≤ 500. Judged on nums1 AFTER the call.
const evens = Array.from({ length: 500 }, (_, i) => i * 2)
const odds = Array.from({ length: 500 }, (_, i) => i * 2 + 1)
const bigMerged = Array.from({ length: 1000 }, (_, i) => i)

export const mergeTwoSortedArrays = {
	slug: 'merge-two-sorted-arrays',
	title: 'Merge Two Sorted Arrays',
	entry: 'merge',
	params: [{ name: 'nums1' }, { name: 'm' }, { name: 'nums2' }, { name: 'n' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'two-pointers'],
	statement: [
		'nums1 and nums2 are sorted in ascending order. nums1 has length m + n: its first m values are real and sorted, and its last n positions are placeholders (zeros) that give you room. nums2 holds n real, sorted values.',
		'Merge nums2 into nums1 so that nums1 ends up holding all m + n values in ascending order. Do this in place: change nums1 and return nothing. Building a different list and returning it does not count, because the caller still holds the original nums1.'
	],
	examples: [
		{ args: [[1, 2, 3, 0, 0, 0], 3, [2, 5, 6], 3], output: [1, 2, 2, 3, 5, 6] },
		{ args: [[1], 1, [], 0], output: [1] },
		{ args: [[0], 0, [1], 1], output: [1] }
	],
	starter:
		'def merge(nums1: list[int], m: int, nums2: list[int], n: int) -> None:\n    # Merge nums2 into nums1 so nums1 is sorted. Change nums1 in place; return nothing.\n    # nums1 has m real values followed by n placeholder zeros.\n    pass',
	// Judged on `nums1` after the call, not on the return value (grading.ts).
	grading: { mode: 'mutate-arg', argIndex: 0 },
	visibleTestIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
	tests: [
		{ id: 't1', args: [[1, 2, 3, 0, 0, 0], 3, [2, 5, 6], 3], expected: [1, 2, 2, 3, 5, 6] },
		{ id: 't2', args: [[1], 1, [], 0], expected: [1] },
		{ id: 't3', args: [[0], 0, [1], 1], expected: [1] },
		// Every value of nums2 is smaller than every real value of nums1.
		{ id: 't4', args: [[4, 5, 6, 0, 0, 0], 3, [1, 2, 3], 3], expected: [1, 2, 3, 4, 5, 6] },
		// Already in order: nothing needs to move.
		{ id: 't5', args: [[1, 2, 3, 0, 0, 0], 3, [4, 5, 6], 3], expected: [1, 2, 3, 4, 5, 6] },
		{ id: 't6', args: [[2, 0], 1, [1], 1], expected: [1, 2] },
		{ id: 't7', args: [[1, 1, 1, 0, 0], 3, [1, 1], 2], expected: [1, 1, 1, 1, 1] },
		{ id: 't8', args: [[-3, -1, 0, 0, 0], 2, [-2, 0, 5], 3], expected: [-3, -2, -1, 0, 5] },
		{ id: 't9', args: [[], 0, [], 0], expected: [] },
		{
			id: 't10',
			args: [[...evens, ...Array.from({ length: 500 }, () => 0)], 500, odds, 500],
			expected: bigMerged
		}
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
		'Compare the final contents of nums1 (not what the function returned) with the expected list: does it hold every real value from both lists, in order, with no leftover placeholder zeros?',
		'The caller keeps the list it passed in and is judged on that same list afterwards. Building a new list, or rebinding the name nums1, leaves the original untouched. Also remember to place the values left over in nums2 after the other list runs out.',
		'Change nums1 itself. Either write the merged values into it position by position, or fill it from the back, where the free placeholder slots are, so no real value is overwritten before it has been used.'
	],
	optimization: {
		title: 'Optional: look for avoidable storage',
		goal: 'Your solution passes. As an optional exercise, ask whether you need a second list to hold the merged result, and where the free space in nums1 is.',
		hints: [
			'A temporary list holds copies of values that already live in nums1 and nums2, so its size grows with the input.',
			'The placeholder slots at the end of nums1 are free, and the largest value overall belongs in the very last slot.',
			'Use three indexes: one at the last real value of nums1, one at the last value of nums2, and one at the last slot of nums1. Repeatedly write the larger of the two values into the last free slot and move that index back. When nums2 runs out, you are done.'
		]
	},
	knownStrategies: [
		{ name: 'Combine and sort', time: 'O((m+n) log(m+n))', space: 'O(m+n)' },
		{ name: 'Fill nums1 from the back', time: 'O(m+n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
