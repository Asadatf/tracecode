import { type ProblemDefinition } from '../problem'
import { seededRandom } from './test-data'

// LeetCode 283 contract: 1 ≤ len ≤ 10⁴, values within the signed 32-bit range.
const LARGE = 10_000
const MAX_INT = 2_147_483_647
const MIN_INT = -2_147_483_648

const random = seededRandom(283)
const alternating = Array.from({ length: LARGE }, (_, i) => (i % 2 === 0 ? 0 : i))
const alternatingExpected = [
	...alternating.filter((x) => x !== 0),
	...Array.from({ length: LARGE / 2 }, () => 0)
]
// Values that are never zero, in no sorted order, so sorting cannot pass it.
const scattered = Array.from({ length: LARGE }, (_, i) =>
	i % 3 === 0 ? 0 : Math.floor(random() * 2_000_000) - 1_000_000 || 1
)
const scatteredExpected = [...scattered.filter((x) => x !== 0), ...scattered.filter((x) => x === 0)]
const zerosFirst = [
	...Array.from({ length: LARGE / 2 }, () => 0),
	...Array.from({ length: LARGE / 2 }, (_, i) => LARGE / 2 - i)
]
const zerosFirstExpected = [...zerosFirst.slice(LARGE / 2), ...zerosFirst.slice(0, LARGE / 2)]

export const moveZeroes = {
	slug: 'move-zeroes',
	title: 'Move Zeroes',
	entry: 'move_zeroes',
	params: [{ name: 'nums' }],
	difficulty: 'medium',
	conceptTags: ['arrays', 'two-pointers'],
	statement: [
		'Given an integer array nums, move every 0 to the end while keeping the non-zero values in their original relative order.',
		'Do this in place: change the list you were given and return nothing. Building a different list and returning it does not count, because the caller still holds the original.'
	],
	examples: [
		{ args: [[0, 1, 0, 3, 12]], output: [1, 3, 12, 0, 0] },
		{ args: [[0]], output: [0] }
	],
	starter:
		'def move_zeroes(nums: list[int]) -> None:\n    # Rearrange nums in place so every 0 is at the end.\n    # Keep the non-zero values in their original order. Return nothing.\n    pass',
	// Judged on `nums` after the call, not on the return value (grading.ts), so
	// `expected` is the final list.
	grading: { mode: 'mutate-arg', argIndex: 0 },
	visibleTestIds: ['t1', 't2', 't4', 't5', 't7', 't10'],
	tests: [
		{ id: 't1', args: [[0, 1, 0, 3, 12]], expected: [1, 3, 12, 0, 0] },
		{ id: 't2', args: [[0]], expected: [0] },
		{ id: 't3', args: [[7]], expected: [7] },
		{ id: 't4', args: [[0, 0, 0, 0]], expected: [0, 0, 0, 0] },
		{ id: 't5', args: [[1, 2, 3]], expected: [1, 2, 3] },
		{ id: 't6', args: [[1, 2, 0, 0]], expected: [1, 2, 0, 0] },
		{ id: 't7', args: [[0, 0, 1]], expected: [1, 0, 0] },
		{ id: 't8', args: [[0, 1]], expected: [1, 0] },
		{ id: 't9', args: [[1, 0]], expected: [1, 0] },
		{ id: 't10', args: [[4, 0, 5, 0, 0, 6]], expected: [4, 5, 6, 0, 0, 0] },
		{ id: 't11', args: [[-1, 0, -2, 0, 3]], expected: [-1, -2, 3, 0, 0] },
		{ id: 't12', args: [[5, 0, 3, 0, 4, 0, 1]], expected: [5, 3, 4, 1, 0, 0, 0] },
		{ id: 't13', args: [[3, 0, 1, 0, 2]], expected: [3, 1, 2, 0, 0] },
		{ id: 't14', args: [[MAX_INT, 0, MIN_INT, 0]], expected: [MAX_INT, MIN_INT, 0, 0] },
		{ id: 't15', args: [[0, 0, 5, 0, 0, 5, 0]], expected: [5, 5, 0, 0, 0, 0, 0] },
		{ id: 't16', args: [alternating], expected: alternatingExpected },
		{ id: 't17', args: [scattered], expected: scatteredExpected },
		{ id: 't18', args: [zerosFirst], expected: zerosFirstExpected },
		{
			id: 't19',
			args: [Array.from({ length: LARGE }, () => 0)],
			expected: Array.from({ length: LARGE }, () => 0)
		}
	],
	arrayVar: 'nums',
	pointerVars: [
		['i', 'nums'],
		['j', 'nums'],
		['read', 'nums'],
		['write', 'nums'],
		['left', 'nums'],
		['right', 'nums'],
		['slow', 'nums'],
		['fast', 'nums'],
		['k', 'nums']
	],
	correctnessHints: [
		'Compare the final contents of nums (not what the function returned) with the expected list: are the non-zero values in their original order, and are all the zeros at the end?',
		'The caller keeps the list it passed in and is judged on that same list afterwards. Building a new list, or rebinding the name nums, leaves the original untouched.',
		'Change the elements of the original list itself: assign to indexes, swap positions, or assign to a full slice, while keeping the non-zero values in the order they came in.'
	],
	optimization: {
		title: 'Optional: look for avoidable storage',
		goal: 'Your solution passes. As an optional exercise, ask whether you need any list beyond the one you were given, and where each non-zero value could be placed directly.',
		hints: [
			'A temporary list holds a copy of values that already live in nums, so its size grows with the input.',
			'A non-zero value never has to move to the right, so the slots to its left that you have already looked at are free to overwrite or swap without losing anything.',
			'Use two indexes: one that scans every element and one that marks the next slot for a non-zero value. Place each non-zero value at the marked slot, advance the mark, and make sure everything from the mark onward ends up zero.'
		]
	},
	knownStrategies: [
		{ name: 'Extra list written back', time: 'O(n)', space: 'O(n)' },
		{ name: 'Two pointers in place', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
