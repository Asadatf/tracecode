import { type ProblemDefinition } from '../problem'

// Contract: nums is non-empty, 1 ≤ len ≤ 1001, values in [-10⁹, 10⁹], and a majority element (one
// that appears MORE than len // 2 times) is guaranteed to exist.
const bigMajority = Array.from({ length: 1001 }, (_, i) => (i % 2 === 0 ? 7 : (i % 9) + 100))
// 7 appears 501 times (every even index) out of 1001: more than half.

export const majorityElement = {
	slug: 'majority-element',
	title: 'Majority Element',
	entry: 'majority_element',
	params: [{ name: 'nums' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'hashing'],
	statement: [
		'Given an integer array nums of length n, return the majority element: the value that appears more than n // 2 times (more than half of the elements).',
		'nums is never empty and a majority element is guaranteed to exist, so you do not need to handle a missing one. The values may be negative and may appear in any order.'
	],
	examples: [
		{ args: [[3, 2, 3]], output: 3 },
		{ args: [[2, 2, 1, 1, 1, 2, 2]], output: 2 }
	],
	starter:
		'def majority_element(nums: list[int]) -> int:\n    # Return the value that appears more than len(nums) // 2 times.\n    # A majority element always exists.\n    return 0',
	visibleTestIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
	tests: [
		{ id: 't1', args: [[3, 2, 3]], expected: 3 },
		{ id: 't2', args: [[2, 2, 1, 1, 1, 2, 2]], expected: 2 },
		{ id: 't3', args: [[1]], expected: 1 },
		{ id: 't4', args: [[-1, -1, -1, 2, 2]], expected: -1 },
		// The majority is neither the first element nor the largest.
		{ id: 't5', args: [[6, 5, 5]], expected: 5 },
		// In the middle position of an unsorted list the value is NOT the majority.
		{ id: 't6', args: [[1, 2, 2, 1, 1]], expected: 1 },
		{ id: 't7', args: [[8, 8, 7, 7, 7]], expected: 7 },
		{ id: 't8', args: [[-5, -5, -5, -5, 3, 3, 3]], expected: -5 },
		{ id: 't9', args: [[1, 2, 3, 3, 3]], expected: 3 },
		{ id: 't10', args: [bigMajority], expected: 7 }
	],
	arrayVar: 'nums',
	pointerVars: [
		['i', 'nums'],
		['j', 'nums']
	],
	correctnessHints: [
		'Check which value your code returns on the failing input and how many times it really appears. Is it more than half of the elements?',
		'The list is not sorted, so the first element, the largest element, or the element in the middle position are not necessarily the majority.',
		'Count how many times each value appears and return the one whose count is more than half the length, or keep a running candidate that gains a vote when it is seen again and loses one when a different value appears.'
	],
	optimization: {
		title: 'Optional: look for avoidable storage',
		goal: 'Your solution passes. As an optional exercise, ask whether you need a count for every distinct value, or whether a single candidate and one counter could be enough.',
		hints: [
			'A table of counts has one entry per distinct value, so its size can grow with the input.',
			'A majority element appears more often than all the other values put together, so it can never be cancelled out completely by pairing it with different values.',
			'Keep a candidate and a count. If the count is 0, take the current value as the candidate. Add 1 when the current value equals the candidate, otherwise subtract 1. The candidate left at the end is the majority element.'
		]
	},
	knownStrategies: [
		{ name: 'Count every value', time: 'O(n)', space: 'O(n)' },
		{ name: 'Boyer–Moore voting', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
