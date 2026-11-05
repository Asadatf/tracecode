import { type ProblemDefinition } from '../problem'

// Contract: s is a list of single-character strings, 0 ≤ len ≤ 1000. Judged on s AFTER the call.
const bigChars = Array.from(
	{ length: 1000 },
	(_, i) => 'abcdefghijklmnopqrstuvwxyz'[i % 26] as string
)

export const reverseString = {
	slug: 'reverse-string',
	title: 'Reverse String',
	entry: 'reverse_string',
	params: [{ name: 's' }],
	difficulty: 'easy',
	conceptTags: ['strings', 'two-pointers'],
	statement: [
		'Given a list s of single characters, reverse the list in place so the first character becomes the last, the second becomes the second to last, and so on.',
		'Do this in place: change the list you were given and return nothing. Building a different reversed list and returning it does not count, because the caller still holds the original.'
	],
	examples: [
		{ args: [['h', 'e', 'l', 'l', 'o']], output: ['o', 'l', 'l', 'e', 'h'] },
		{ args: [['H', 'a', 'n', 'n', 'a', 'h']], output: ['h', 'a', 'n', 'n', 'a', 'H'] }
	],
	starter:
		'def reverse_string(s: list[str]) -> None:\n    # Reverse the list s in place. Return nothing.\n    pass',
	// Judged on `s` after the call, not on the return value (grading.ts).
	grading: { mode: 'mutate-arg', argIndex: 0 },
	visibleTestIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
	tests: [
		{ id: 't1', args: [['h', 'e', 'l', 'l', 'o']], expected: ['o', 'l', 'l', 'e', 'h'] },
		{ id: 't2', args: [['H', 'a', 'n', 'n', 'a', 'h']], expected: ['h', 'a', 'n', 'n', 'a', 'H'] },
		{ id: 't3', args: [[]], expected: [] },
		{ id: 't4', args: [['a']], expected: ['a'] },
		{ id: 't5', args: [['a', 'b']], expected: ['b', 'a'] },
		{ id: 't6', args: [['a', 'a', 'b', 'b']], expected: ['b', 'b', 'a', 'a'] },
		{ id: 't7', args: [['1', '2', '3']], expected: ['3', '2', '1'] },
		{
			id: 't8',
			args: [['r', 'a', 'c', 'e', 'c', 'a', 'r']],
			expected: ['r', 'a', 'c', 'e', 'c', 'a', 'r']
		},
		{
			id: 't9',
			args: [['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']],
			expected: ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']
		},
		{ id: 't10', args: [bigChars], expected: [...bigChars].reverse() }
	],
	arrayVar: 's',
	pointerVars: [
		['left', 's'],
		['right', 's'],
		['i', 's'],
		['j', 's']
	],
	correctnessHints: [
		'Compare the final contents of s (not what the function returned) with the expected list: is the first character now last, and the last first?',
		'The caller keeps the list it passed in and is judged on that same list afterwards. Building a new list, or rebinding the name s, leaves the original untouched.',
		'Change the elements of the original list itself: swap pairs of positions from the two ends toward the middle, or assign to a full slice.'
	],
	optimization: {
		title: 'Optional: look for avoidable storage',
		goal: 'Your solution passes. As an optional exercise, ask whether you need any list beyond the one you were given, and how many swaps it really takes.',
		hints: [
			'A reversed copy holds every character twice, so the extra storage grows with the list.',
			'Swapping the first and last characters puts both in their final place, and the same is true for the next pair inward.',
			'Use two indexes, one at each end. Swap the characters they point at, move them toward each other, and stop when they meet or cross.'
		]
	},
	knownStrategies: [
		{ name: 'Reversed copy written back', time: 'O(n)', space: 'O(n)' },
		{ name: 'Swap from both ends', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
