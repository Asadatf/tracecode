import { type ProblemDefinition } from '../problem'
import { shuffled } from './test-data'

// Contract: nums holds n distinct integers taken from the inclusive range [0, n], so exactly one
// number in that range is missing. 0 ≤ n ≤ 2000. The empty list means n = 0 and the answer is 0.
const range = (n: number) => Array.from({ length: n + 1 }, (_, i) => i)
const without = (n: number, gone: number) => range(n).filter((x) => x !== gone)
const bigList = shuffled(without(2000, 1234), 11)

export const missingNumber = {
	slug: 'missing-number',
	title: 'Missing Number',
	entry: 'missing_number',
	params: [{ name: 'nums' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'math'],
	statement: [
		'nums contains n distinct integers, each between 0 and n inclusive. That range holds n + 1 numbers, so exactly one of them is missing. Return the missing number.',
		'The numbers may be in any order. An empty list means n = 0, so the only number in range is 0 and the answer is 0.'
	],
	examples: [
		{ args: [[3, 0, 1]], output: 2 },
		{ args: [[0, 1]], output: 2 },
		{ args: [[9, 6, 4, 2, 3, 5, 7, 0, 1]], output: 8 }
	],
	starter:
		'def missing_number(nums: list[int]) -> int:\n    # Return the one number in the range 0..len(nums) that is not in nums.\n    return 0',
	visibleTestIds: ['t1', 't2', 't3', 't4', 't7', 't8'],
	tests: [
		{ id: 't1', args: [[3, 0, 1]], expected: 2 },
		{ id: 't2', args: [[0, 1]], expected: 2 },
		{ id: 't3', args: [[9, 6, 4, 2, 3, 5, 7, 0, 1]], expected: 8 },
		{ id: 't4', args: [[]], expected: 0 },
		{ id: 't5', args: [[0]], expected: 1 },
		{ id: 't6', args: [[1]], expected: 0 },
		// The missing number is 0.
		{ id: 't7', args: [[1, 2, 3]], expected: 0 },
		// The missing number is n itself.
		{ id: 't8', args: [[0, 1, 2, 3]], expected: 4 },
		{ id: 't9', args: [[5, 3, 0, 1, 2, 6, 4, 7, 9]], expected: 8 },
		{ id: 't10', args: [bigList], expected: 1234 }
	],
	arrayVar: 'nums',
	pointerVars: [
		['i', 'nums'],
		['j', 'nums']
	],
	correctnessHints: [
		'Check which numbers your answer can be. The list has n values, but the missing number can be anything from 0 up to and including n.',
		'The list is not sorted, so you cannot rely on nums[i] being i. Also the answer can be 0 (the list starts at 1) or n (the list stops at n - 1).',
		'Either record which numbers you have seen and report the first one in 0..n that you did not, or use the fact that the numbers 0..n have a known total: subtract the sum of nums from it.'
	],
	optimization: {
		title: 'Optional: look for avoidable storage',
		goal: 'Your solution passes. As an optional exercise, ask whether you need to remember every number you have seen, or whether one running value can capture what is missing.',
		hints: [
			'A collection of the numbers seen holds one entry per number, so its size grows with the input.',
			'The numbers 0 through n have a total you can compute directly, and nums holds all of them except one.',
			'Compute the expected total of 0..n with a formula and subtract the actual sum of nums; the difference is the missing number. Combining indexes and values with XOR works the same way.'
		]
	},
	knownStrategies: [
		{ name: 'Remember seen numbers', time: 'O(n)', space: 'O(n)' },
		{ name: 'Expected sum minus actual sum', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
