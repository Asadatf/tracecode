import { type ProblemDefinition } from './problem'

// Demo-slice problem set. Just Two Sum for now; the structure takes more without
// change. Ported from the prototype's tracecode-problems.json, with named test
// inputs ({nums, target}) rewritten as POSITIONAL args in `params` order.
export const twoSum = {
	slug: 'two-sum',
	title: 'Two Sum',
	entry: 'two_sum',
	params: [{ name: 'nums' }, { name: 'target' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'loops'],
	statement: [
		'Given an array of integers nums and an integer target, return the indices of the two numbers whose sum equals the target.',
		'Each input has exactly one solution. You may not use the same element twice. Return indices in increasing order.'
	],
	examples: [
		{ args: [[2, 7, 11, 15], 9], output: [0, 1] },
		{ args: [[3, 2, 4], 6], output: [1, 2] }
	],
	starter:
		'def two_sum(nums: list[int], target: int) -> list[int]:\n    # Return indices of two different elements whose sum is target.\n    return []',
	tests: [
		{ id: 't1', args: [[2, 7, 11, 15], 9], expected: [0, 1] },
		{ id: 't2', args: [[3, 2, 4], 6], expected: [1, 2] },
		{ id: 't3', args: [[3, 3], 6], expected: [0, 1] }
	],
	arrayVar: 'nums',
	pointerVars: [
		['i', 'nums'],
		['j', 'nums']
	],
	knownStrategies: [
		{ name: 'Nested loops', time: 'O(n²)', space: 'O(1)' },
		{ name: 'Hash map', time: 'O(n) average', space: 'O(n)' }
	]
} satisfies ProblemDefinition

// Ported from the prototype's tracecode-problems.json. Single positional
// param; expected values are Python booleans. The engine is unchanged — only
// this data and the problem's own metadata differ.
export const containsDuplicate = {
	slug: 'contains-duplicate',
	title: 'Contains Duplicate',
	entry: 'contains_duplicate',
	params: [{ name: 'nums' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'hashing'],
	statement: [
		'Given an integer array nums, return True if any value appears at least twice. Otherwise return False.',
		'An empty array or an array with all distinct elements returns False. Your function must return a Python boolean.'
	],
	examples: [
		{ args: [[1, 2, 3, 1]], output: true },
		{ args: [[1, 2, 3, 4]], output: false }
	],
	starter:
		'def contains_duplicate(nums: list[int]) -> bool:\n    # Return True if any number appears more than once.\n    # Start with any correct approach.\n    return False',
	tests: [
		{ id: 't1', args: [[1, 2, 3, 1]], expected: true },
		{ id: 't2', args: [[1, 2, 3, 4]], expected: false },
		{ id: 't3', args: [[1, 1]], expected: true },
		{ id: 't4', args: [[]], expected: false },
		{ id: 't5', args: [[-1, 0, -1]], expected: true }
	],
	arrayVar: 'nums',
	pointerVars: [
		['i', 'nums'],
		['j', 'nums']
	],
	knownStrategies: [
		{ name: 'Nested loops', time: 'O(n²)', space: 'O(1)' },
		{ name: 'Set membership', time: 'O(n) average', space: 'O(n)' },
		{ name: 'Sort then scan', time: 'O(n log n)', space: 'Depends on implementation' }
	]
} satisfies ProblemDefinition

export const PROBLEMS: Record<string, ProblemDefinition> = {
	[twoSum.slug]: twoSum,
	[containsDuplicate.slug]: containsDuplicate
}
