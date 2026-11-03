import { type ProblemDefinition } from '../problem'

// LeetCode 70 contract: 1 ≤ n ≤ 45, so every answer fits in 32 bits. Plain
// recursion without remembering results makes about 2ⁿ calls and cannot finish
// the larger tests inside the 5 s run budget.

export const climbingStairs = {
	slug: 'climbing-stairs',
	title: 'Climbing Stairs',
	entry: 'climb_stairs',
	params: [{ name: 'n' }],
	difficulty: 'easy',
	conceptTags: ['dynamic-programming', 'recursion'],
	statement: [
		'A staircase has n steps. Each move climbs either 1 step or 2 steps.',
		'Return the number of different sequences of moves that reach the top exactly.'
	],
	examples: [
		{ args: [2], output: 2 },
		{ args: [3], output: 3 }
	],
	starter:
		'def climb_stairs(n: int) -> int:\n    # Count the ways to climb n steps, 1 or 2 steps at a time.\n    return 0',
	tests: [
		{ id: 't1', args: [1], expected: 1 },
		{ id: 't2', args: [2], expected: 2 },
		{ id: 't3', args: [3], expected: 3 },
		{ id: 't4', args: [4], expected: 5 },
		{ id: 't5', args: [5], expected: 8 },
		{ id: 't6', args: [6], expected: 13 },
		{ id: 't7', args: [10], expected: 89 },
		{ id: 't8', args: [15], expected: 987 },
		{ id: 't9', args: [20], expected: 10946 },
		{ id: 't10', args: [25], expected: 121393 },
		{ id: 't11', args: [30], expected: 1346269 },
		{ id: 't12', args: [35], expected: 14930352 },
		{ id: 't13', args: [38], expected: 63245986 },
		{ id: 't14', args: [40], expected: 165580141 },
		{ id: 't15', args: [44], expected: 1134903170 },
		{ id: 't16', args: [45], expected: 1836311903 }
	],
	correctnessHints: [
		'Work out small cases by hand: list every way to climb 3 steps and 4 steps. Does your function give 3 and 5?',
		'The order of moves matters: 1 then 2 is a different way from 2 then 1. There is exactly 1 way to climb 1 step and 2 ways to climb 2 steps.',
		'The last move onto step n came either from step n − 1 or from step n − 2, so the ways to reach n are the ways to reach n − 1 plus the ways to reach n − 2.'
	],
	optimization: {
		title: 'Optional: keep only what you need',
		goal: 'Your solution passes. As an optional exercise, ask how many earlier answers you really need to keep while you work up to step n.',
		hints: [
			'A list with an entry for every step uses memory that grows with n.',
			'Each step only ever needs the answers for the two steps just below it.',
			'Keep two numbers for the last two steps, and on each step replace them with the newer one and their sum.'
		]
	},
	knownStrategies: [
		{ name: 'Table of ways for every step', time: 'O(n)', space: 'O(n)' },
		{ name: 'Two running values', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
