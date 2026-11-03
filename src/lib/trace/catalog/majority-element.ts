import { type ProblemDefinition } from '../problem'
import { shuffled } from './test-data'

// LeetCode 169 contract: 1 ≤ len ≤ 5·10⁴ (capped at 10 001 here), values within
// ±10⁹, and a majority value (more than half the list) always exists.
const SIZE = 10_001
const MAJORITY = SIZE / 2 + 0.5 // 5 001 copies
const BIG = 1_000_000_000

// The majority value at every even index, distinct values between.
const interleaved = Array.from({ length: SIZE }, (_, i) => (i % 2 === 0 ? 7 : -(i + 1)))
// The minority comes first: a solution that guesses from the start is wrong.
const majorityLast = [
	...Array.from({ length: SIZE - MAJORITY }, (_, i) => i + 1),
	...Array.from({ length: MAJORITY }, () => -42)
]
const scrambled = shuffled(
	[
		...Array.from({ length: MAJORITY }, () => BIG),
		...Array.from({ length: SIZE - MAJORITY }, (_, i) => i % 3)
	],
	169
)

export const majorityElement = {
	slug: 'majority-element',
	title: 'Majority Element',
	entry: 'majority_element',
	params: [{ name: 'nums' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'hashing'],
	statement: [
		'Given a list of integers nums, return the value that appears more than half the time.',
		'You can assume such a value always exists.'
	],
	examples: [
		{ args: [[3, 2, 3]], output: 3 },
		{ args: [[2, 2, 1, 1, 1, 2, 2]], output: 2 }
	],
	starter:
		'def majority_element(nums: list[int]) -> int:\n    # Return the value that appears more than len(nums) // 2 times.\n    return nums[0]',
	tests: [
		{ id: 't1', args: [[3, 2, 3]], expected: 3 },
		{ id: 't2', args: [[2, 2, 1, 1, 1, 2, 2]], expected: 2 },
		{ id: 't3', args: [[1]], expected: 1 },
		{ id: 't4', args: [[5, 5]], expected: 5 },
		{ id: 't5', args: [[1, 2, 1]], expected: 1 },
		{ id: 't6', args: [[-1, -1, 2]], expected: -1 },
		{ id: 't7', args: [[0, 0, 0, 1]], expected: 0 },
		{ id: 't8', args: [[6, 5, 5]], expected: 5 },
		{ id: 't9', args: [[4, 4, 4, 4]], expected: 4 },
		{ id: 't10', args: [[1, 2, 3, 2, 2]], expected: 2 },
		{ id: 't11', args: [[7, 7, 8, 8, 7]], expected: 7 },
		{ id: 't12', args: [[BIG, -BIG, BIG]], expected: BIG },
		{ id: 't13', args: [[2, 1, 2, 1, 2]], expected: 2 },
		{ id: 't14', args: [[9, 1, 9, 2, 9, 3, 9]], expected: 9 },
		{ id: 't15', args: [[1, 1, 2, 2, 2, 1, 1]], expected: 1 },
		{ id: 't16', args: [[8, 9, 9]], expected: 9 },
		{ id: 't17', args: [interleaved], expected: 7 },
		{ id: 't18', args: [majorityLast], expected: -42 },
		{ id: 't19', args: [scrambled], expected: BIG }
	],
	arrayVar: 'nums',
	pointerVars: [
		['i', 'nums'],
		['j', 'nums']
	],
	correctnessHints: [
		'For a failing input, count how often each value appears by hand. Which value appears more than half the time, and what did your function return instead?',
		'More than half means strictly more than len(nums) // 2 times. The most common value early in the list, or the first value, is not necessarily the majority.',
		'Count how many times each value appears, for example in a dictionary, then return the value whose count is more than half the length of the list.'
	],
	optimization: {
		title: 'Optional: find it without counting every value',
		goal: 'Your solution passes. As an optional exercise, ask whether you need a count for every different value, or whether a single candidate and one number are enough.',
		hints: [
			'A dictionary of counts can hold almost half as many entries as the list, so its memory grows with the input.',
			'If you pair up each majority copy with a different value and cancel both, the majority still has copies left over, because it has more than all the others combined.',
			'Walk through the list keeping a candidate and a count. When the count is 0, take the current value as the candidate. Add 1 when the value matches the candidate and subtract 1 when it does not. The candidate at the end is the majority.'
		]
	},
	knownStrategies: [
		{ name: 'Count with a dictionary', time: 'O(n)', space: 'O(n)' },
		{ name: 'Boyer–Moore voting', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
