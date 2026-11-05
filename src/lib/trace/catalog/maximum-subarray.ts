import { type ProblemDefinition } from '../problem'

// Contract: 1 ≤ len ≤ 1000, each value an integer in [-10⁴, 10⁴]. The answer uses at least one element.
const rises = Array.from({ length: 1000 }, (_, i) => (i % 5 === 4 ? -7 : (i % 7) - 1))
function best(nums: number[]): number {
	let run = nums[0] as number
	let top = run
	for (const x of nums.slice(1)) {
		run = Math.max(x, run + x)
		top = Math.max(top, run)
	}
	return top
}

export const maximumSubarray = {
	slug: 'maximum-subarray',
	title: 'Maximum Subarray',
	entry: 'max_sub_array',
	params: [{ name: 'nums' }],
	difficulty: 'medium',
	conceptTags: ['arrays', 'dynamic-programming'],
	statement: [
		'Given an integer array nums with at least one element, find the contiguous run of one or more neighbouring elements that has the largest sum, and return that sum.',
		'The run must be unbroken: you may not skip elements. It must contain at least one element, so if every number is negative the answer is the largest (least negative) single number.'
	],
	examples: [
		{ args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], output: 6 },
		{ args: [[1]], output: 1 },
		{ args: [[5, 4, -1, 7, 8]], output: 23 }
	],
	starter:
		'def max_sub_array(nums: list[int]) -> int:\n    # Return the largest sum of any non-empty run of neighbouring elements.\n    # nums always has at least one element, and it may be all negative.\n    return nums[0]',
	visibleTestIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
	tests: [
		{ id: 't1', args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
		{ id: 't2', args: [[1]], expected: 1 },
		{ id: 't3', args: [[5, 4, -1, 7, 8]], expected: 23 },
		// A single negative number is still the answer: the run cannot be empty.
		{ id: 't4', args: [[-1]], expected: -1 },
		{ id: 't5', args: [[-3, -2, -1]], expected: -1 },
		// Not contiguous: adding every positive number would give 3.
		{ id: 't6', args: [[1, -5, 1, 1]], expected: 2 },
		{ id: 't7', args: [[0, 0, 0]], expected: 0 },
		{ id: 't8', args: [[-1, -2, 3, 4]], expected: 7 },
		{ id: 't9', args: [[5, -9, 1]], expected: 5 },
		{ id: 't10', args: [[2, -1, 2, -1, 2]], expected: 4 },
		{ id: 't11', args: [rises], expected: best(rises) }
	],
	arrayVar: 'nums',
	pointerVars: [
		['i', 'nums'],
		['j', 'nums']
	],
	correctnessHints: [
		'Look at the failing input. Is the answer you returned a real sum of neighbouring elements, and could a run of length one be better than anything longer?',
		'The run must be unbroken and non-empty. If every element is negative, the best run is the single largest element, so an answer that starts from 0 is wrong.',
		'Track, at each position, the best sum of a run that ends there: either that element alone, or that element added to the best run ending just before it. Keep the largest value seen.'
	],
	optimization: {
		title: 'Optional: look for repeated work',
		goal: 'Your solution passes. As an optional exercise, ask whether you need to add up the same neighbouring elements over and over, or whether each position can reuse what you learned at the one before.',
		hints: [
			'Summing every run from scratch adds the same elements many times, so the total work grows quickly with the length.',
			'The best run that ends at one position is built from the best run that ended at the position before it, so you only ever need that one earlier value.',
			'Keep two numbers while you scan once: the best sum of a run ending here, and the best sum seen anywhere. At each element, choose between starting fresh at it or extending the previous run.'
		]
	},
	knownStrategies: [
		{ name: 'Try every start and end', time: 'O(n²)', space: 'O(1)' },
		{ name: "Best run ending here (Kadane's)", time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
