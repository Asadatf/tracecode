import { type ProblemDefinition } from '../problem'

// Contract: s contains only lowercase English letters a–z, 0 ≤ len ≤ 5000. The empty string has no
// unique character, so the answer is -1.
// 25 letters (no z), each twice, repeated: every letter repeats. A single z at the end is then the
// only unique character.
const bigNone = 'abcdefghijklmnopqrstuvwxy'.repeat(2).repeat(98) // 4900 chars
const bigLast = bigNone + 'z'

export const firstUniqueCharacter = {
	slug: 'first-unique-character',
	title: 'First Unique Character',
	entry: 'first_uniq_char',
	params: [{ name: 's' }],
	difficulty: 'easy',
	conceptTags: ['strings', 'hashing'],
	statement: [
		'Given a string s, return the index of the first character that appears exactly once in the whole string. If no character appears exactly once, return -1.',
		's contains only lowercase English letters a–z and may be empty, in which case the answer is -1. Indexes start at 0.'
	],
	examples: [
		{ args: ['leetcode'], output: 0 },
		{ args: ['loveleetcode'], output: 2 },
		{ args: ['aabb'], output: -1 }
	],
	starter:
		'def first_uniq_char(s: str) -> int:\n    # Return the index of the first character that appears exactly once in s,\n    # or -1 if there is none.\n    return -1',
	visibleTestIds: ['t1', 't2', 't3', 't4', 't5', 't8'],
	tests: [
		{ id: 't1', args: ['leetcode'], expected: 0 },
		{ id: 't2', args: ['loveleetcode'], expected: 2 },
		{ id: 't3', args: ['aabb'], expected: -1 },
		{ id: 't4', args: [''], expected: -1 },
		{ id: 't5', args: ['z'], expected: 0 },
		{ id: 't6', args: ['aa'], expected: -1 },
		// Neighbours always differ, yet every letter repeats later.
		{ id: 't7', args: ['abcabc'], expected: -1 },
		// The only unique character is the last one.
		{ id: 't8', args: ['aabbc'], expected: 4 },
		{ id: 't9', args: ['abaccdeff'], expected: 1 },
		{ id: 't10', args: [bigNone], expected: -1 },
		{ id: 't11', args: [bigLast], expected: bigNone.length }
	],
	correctnessHints: [
		'Check what your code returns when no character is unique, and when the string is empty. Is it -1?',
		'A character is unique only if it appears once in the WHOLE string, not just next to itself. In "abcabc" no two neighbours are equal, but every letter appears twice.',
		'First find out how many times each character appears anywhere in the string. Then look at the characters from the front and return the index of the first whose count is exactly 1.'
	],
	optimization: {
		title: 'Optional: look for repeated work',
		goal: 'Your solution passes. As an optional exercise, ask whether you recount the whole string for every character, and whether the counts could be gathered once.',
		hints: [
			'Counting a character by scanning the whole string, once per character, repeats the same scans many times.',
			'One pass over the string is enough to learn how often every letter appears.',
			'Store the count of each character in a dictionary (or a list of 26 counters) in one pass, then make a second pass from the front and return the first index whose character has a count of 1.'
		]
	},
	knownStrategies: [
		{ name: 'Count each character by rescanning', time: 'O(n²)', space: 'O(1)' },
		{ name: 'Count once, then scan again', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
