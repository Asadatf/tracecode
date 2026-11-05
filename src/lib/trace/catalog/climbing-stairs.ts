import { type ProblemDefinition } from '../problem'

// Contract: n is an integer, 1 ≤ n ≤ 35. The number of ways for n = 35 is 14,930,352, far inside
// Python's integer range. The tests stop at 30 so that a plain two-way recursion still finishes.

export const climbingStairs = {
	slug: 'climbing-stairs',
	title: 'Climbing Stairs',
	entry: 'climb_stairs',
	params: [{ name: 'n' }],
	difficulty: 'easy',
	conceptTags: ['dynamic-programming'],
	statement: [
		'A staircase has n steps. Each move you climb either 1 step or 2 steps. Return the number of distinct sequences of moves that reach exactly the top.',
		'For example, with 3 steps you can climb 1+1+1, 1+2 or 2+1, so there are 3 ways. n is between 1 and 35, and the order of the moves matters.'
	],
	examples: [
		{ args: [1], output: 1 },
		{ args: [2], output: 2 },
		{ args: [3], output: 3 },
		{ args: [5], output: 8 }
	],
	starter:
		'def climb_stairs(n: int) -> int:\n    # Return the number of distinct ways to climb n steps, taking 1 or 2 steps at a time.\n    return 0',
	visibleTestIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
	tests: [
		{ id: 't1', args: [1], expected: 1 },
		{ id: 't2', args: [2], expected: 2 },
		{ id: 't3', args: [3], expected: 3 },
		{ id: 't4', args: [4], expected: 5 },
		{ id: 't5', args: [5], expected: 8 },
		{ id: 't6', args: [10], expected: 89 },
		{ id: 't7', args: [20], expected: 10946 },
		{ id: 't8', args: [30], expected: 1346269 }
	],
	correctnessHints: [
		'Check the smallest inputs first. How many ways are there for 1 step, and for 2 steps? Does your answer match the examples for n = 1, 2, 3?',
		'To reach step n, your last move came either from step n - 1 (a 1-step move) or from step n - 2 (a 2-step move), so the ways to reach step n add up the ways for those two steps.',
		'Set the answers for the first two steps directly, then build upward: the answer for step k is the answer for step k - 1 plus the answer for step k - 2.'
	],
	optimization: {
		title: 'Optional: look for repeated work',
		goal: 'Your solution passes. As an optional exercise, ask whether you compute the same smaller answer more than once, and how many earlier answers you really need to keep.',
		hints: [
			'A plain recursion asks for the same smaller step counts again and again, so the work can double with every extra step.',
			'The answer for any step depends only on the two answers just before it, so older answers can be forgotten.',
			'Build from the bottom: start from the answers for the first two steps and repeat n - 2 times, each time replacing the pair with (the second, their sum). Two variables are enough.'
		]
	},
	knownStrategies: [
		{ name: 'Recursion with a memo table', time: 'O(n)', space: 'O(n)' },
		{ name: 'Two running values', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
