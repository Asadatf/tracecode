import { type ProblemDefinition } from '../problem'

// LeetCode 704 contract: 1 ≤ len ≤ 10⁴, values and target in (-10⁴, 10⁴), all
// values unique, sorted ascending. The large array is the densest the contract
// allows with room for absent targets: every second value from -9999 to 9999.
const LARGE = 10_000
const large = Array.from({ length: LARGE }, (_, i) => -9999 + 2 * i)
const sixteen = Array.from({ length: 16 }, (_, i) => i * 3)

export const binarySearch = {
	slug: 'binary-search',
	title: 'Binary Search',
	entry: 'search',
	params: [{ name: 'nums' }, { name: 'target' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'binary-search'],
	statement: [
		'Given an array nums of distinct integers sorted in ascending order and an integer target, return the index of target in nums, or -1 if it is not there.',
		'Any correct approach is accepted. The values are unique, so there is at most one matching index.'
	],
	examples: [
		{ args: [[-1, 0, 3, 5, 9, 12], 9], output: 4 },
		{ args: [[-1, 0, 3, 5, 9, 12], 2], output: -1 }
	],
	starter:
		'def search(nums: list[int], target: int) -> int:\n    # Return the index of target in the sorted list nums, or -1 if absent.\n    return -1',
	tests: [
		{ id: 't1', args: [[-1, 0, 3, 5, 9, 12], 9], expected: 4 },
		{ id: 't2', args: [[-1, 0, 3, 5, 9, 12], 2], expected: -1 },
		{ id: 't3', args: [[5], 5], expected: 0 },
		{ id: 't4', args: [[5], -1], expected: -1 },
		{ id: 't5', args: [[5], 6], expected: -1 },
		{ id: 't6', args: [[1, 3], 1], expected: 0 },
		{ id: 't7', args: [[1, 3], 3], expected: 1 },
		{ id: 't8', args: [[1, 3], 2], expected: -1 },
		{ id: 't9', args: [[-1, 0, 3, 5, 9, 12], -1], expected: 0 },
		{ id: 't10', args: [[-1, 0, 3, 5, 9, 12], 12], expected: 5 },
		{ id: 't11', args: [[-1, 0, 3, 5, 9, 12], -5], expected: -1 },
		{ id: 't12', args: [[-1, 0, 3, 5, 9, 12], 100], expected: -1 },
		{ id: 't13', args: [[2, 4, 6, 8, 10], 6], expected: 2 },
		{ id: 't14', args: [[2, 4, 6, 8, 10], 8], expected: 3 },
		{ id: 't15', args: [[2, 4, 6, 8, 10], 7], expected: -1 },
		{ id: 't16', args: [[-9999, 0, 9999], -9999], expected: 0 },
		{ id: 't17', args: [[-9999, 0, 9999], 9999], expected: 2 },
		{ id: 't18', args: [[-9999, 0, 9999], 0], expected: 1 },
		{ id: 't19', args: [sixteen, 45], expected: 15 },
		{ id: 't20', args: [sixteen, 0], expected: 0 },
		{ id: 't21', args: [sixteen, 22], expected: -1 },
		{ id: 't22', args: [large, 9999], expected: LARGE - 1 },
		{ id: 't23', args: [large, -9999], expected: 0 },
		{ id: 't24', args: [large, 4001], expected: 7000 },
		{ id: 't25', args: [large, 0], expected: -1 }
	],
	arrayVar: 'nums',
	pointerVars: [
		['left', 'nums'],
		['mid', 'nums'],
		['right', 'nums'],
		['low', 'nums'],
		['high', 'nums'],
		['lo', 'nums'],
		['hi', 'nums'],
		['l', 'nums'],
		['r', 'nums'],
		['i', 'nums']
	],
	correctnessHints: [
		'Look at which tests fail: a target at the very start or end, an absent value, or a one-element list? Edge positions usually expose the bug.',
		'The result is an index, not the value stored there, and -1 means "absent". Make sure -1 is returned only after every position your approach is responsible for has been considered.',
		'Walk one failing test by hand: write down which indexes your code examined, then which index it should have examined to find the target. The first difference is the bug.'
	],
	optimization: {
		title: 'Optional: use the sorted order',
		goal: 'Your solution passes. As an optional exercise, ask what the "sorted ascending" guarantee lets one comparison tell you, and whether every element really needs to be looked at.',
		hints: [
			'Checking elements one by one treats the list as if it were unordered, but sorted order means each comparison carries information about many elements at once.',
			'If the middle value is smaller than target, everything at or before it is smaller too and cannot be the answer. If it is larger, everything at or after it is out. Each comparison can rule out about half of what remains.',
			'Keep a window of positions that could still hold target, using two indexes. Probe the middle, then shrink the window past the probe according to the comparison, and stop when the window is empty. Decide whether both ends are inclusive and stay consistent.'
		]
	},
	knownStrategies: [
		{ name: 'Linear scan', time: 'O(n)', space: 'O(1)' },
		{ name: 'Iterative binary search', time: 'O(log n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
