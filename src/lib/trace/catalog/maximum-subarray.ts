import { type ProblemDefinition } from '../problem'
import { seededRandom } from './test-data'

// LeetCode 53 contract: 1 ≤ len ≤ 10⁵, −10⁴ ≤ value ≤ 10⁴. The large tests are
// capped at 1 500 values so the straightforward every-start baseline still
// finishes inside the 5 s run budget in Pyodide.
const LARGE = 1500
const LIMIT = 10_000

const random = seededRandom(53)
const mixed = Array.from({ length: LARGE }, () => Math.floor(random() * (2 * LIMIT + 1)) - LIMIT)
const allNegative = Array.from({ length: LARGE }, (_, i) => -1 - ((i * 7919) % LIMIT))
const allPositive = Array.from({ length: LARGE }, (_, i) => 1 + ((i * 31) % 100))

// Best sum of a non-empty run, computed directly so the literal tests stay
// readable. ORACLES cross-checks it with a different method.
function bestRun(nums: readonly number[]): number {
	let best = -Infinity
	let current = 0
	for (const x of nums) {
		current = Math.max(x, current + x)
		best = Math.max(best, current)
	}
	return best
}

export const maximumSubarray = {
	slug: 'maximum-subarray',
	title: 'Maximum Subarray',
	entry: 'max_sub_array',
	params: [{ name: 'nums' }],
	difficulty: 'medium',
	conceptTags: ['arrays', 'dynamic-programming'],
	statement: [
		'Given a list of integers nums, find the run of one or more neighbouring values with the largest sum, and return that sum.',
		'The run must contain at least one value, so when every value is negative the answer is the largest single value.'
	],
	examples: [
		{ args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], output: 6 },
		{ args: [[1]], output: 1 },
		{ args: [[5, 4, -1, 7, 8]], output: 23 }
	],
	starter:
		'def max_sub_array(nums: list[int]) -> int:\n    # Return the largest sum of a run of neighbouring values (at least one value).\n    return 0',
	tests: [
		{ id: 't1', args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
		{ id: 't2', args: [[1]], expected: 1 },
		{ id: 't3', args: [[5, 4, -1, 7, 8]], expected: 23 },
		{ id: 't4', args: [[-1]], expected: -1 },
		{ id: 't5', args: [[-3, -1, -2]], expected: -1 },
		{ id: 't6', args: [[0]], expected: 0 },
		{ id: 't7', args: [[0, 0, 0]], expected: 0 },
		{ id: 't8', args: [[2, -1, 2]], expected: 3 },
		{ id: 't9', args: [[-2, -1]], expected: -1 },
		{ id: 't10', args: [[1, 2, 3]], expected: 6 },
		{ id: 't11', args: [[3, -10, 4]], expected: 4 },
		{ id: 't12', args: [[-1, 3, -1, 3, -1]], expected: 5 },
		{ id: 't13', args: [[LIMIT, -LIMIT, LIMIT]], expected: LIMIT },
		{ id: 't14', args: [[-LIMIT, -LIMIT, -LIMIT]], expected: -LIMIT },
		{ id: 't15', args: [[8, -19, 5, -4, 20]], expected: 21 },
		{ id: 't16', args: [[-5, 4, -1, 2, -8, 3]], expected: 5 },
		{ id: 't17', args: [mixed], expected: bestRun(mixed) },
		{ id: 't18', args: [allNegative], expected: Math.max(...allNegative) },
		{ id: 't19', args: [allPositive], expected: allPositive.reduce((a, b) => a + b, 0) }
	],
	arrayVar: 'nums',
	pointerVars: [
		['i', 'nums'],
		['j', 'nums'],
		['start', 'nums'],
		['end', 'nums']
	],
	correctnessHints: [
		'Find the best run by hand for a failing input: where does it start and end, and what does it add up to? Is your answer bigger, smaller or a different run?',
		'The run must contain at least one value. Starting the best sum at 0 gives the wrong answer when every value is negative, and the run has to be neighbouring values, not any values you like.',
		'For every possible starting position, keep adding the next value and remember the biggest total you reach. The largest of those totals over all starts is the answer.'
	],
	optimization: {
		title: 'Optional: find the best run in one pass',
		goal: 'Your solution passes. As an optional exercise, ask whether you need to try every starting position, or whether one walk through the list is enough.',
		hints: [
			'Trying every start and every end means the work grows with the square of the list length.',
			'At each position, the best run ending there either starts fresh at this value or continues the best run ending one step earlier.',
			'Walk through the list once, keeping the best sum of a run that ends at the current value and the best sum seen anywhere. A running total that has gone negative only drags the next value down.'
		]
	},
	knownStrategies: [
		{ name: 'Every starting position', time: 'O(n²)', space: 'O(1)' },
		{ name: "Kadane's running best", time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
