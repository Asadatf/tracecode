import { type ProblemDefinition } from '../problem'

// Contract: strs is a list of 0 ≤ len ≤ 200 strings, each of lowercase English letters a–z with
// 0 ≤ length ≤ 500 (empty strings are allowed). The prefix must start at index 0 of every string.
const stem = 'x'.repeat(299)
const bigStrs = Array.from(
	{ length: 150 },
	(_, i) => stem + 'abcdefghij'[i % 10]!.repeat((i % 3) + 1)
)

export const longestCommonPrefix = {
	slug: 'longest-common-prefix',
	title: 'Longest Common Prefix',
	entry: 'longest_common_prefix',
	params: [{ name: 'strs' }],
	difficulty: 'easy',
	conceptTags: ['strings'],
	statement: [
		'Given a list of strings strs, return the longest string that every string in the list starts with. If they share no common start, return the empty string "".',
		'The prefix has to be unbroken and has to begin at the first character of every string. The list may be empty, and it may contain empty strings; in both cases the answer is "".'
	],
	examples: [
		{ args: [['flower', 'flow', 'flight']], output: 'fl' },
		{ args: [['dog', 'racecar', 'car']], output: '' },
		{ args: [[]], output: '' }
	],
	starter:
		'def longest_common_prefix(strs: list[str]) -> str:\n    # Return the longest prefix shared by every string in strs, or "" if there is none.\n    return ""',
	visibleTestIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
	tests: [
		{ id: 't1', args: [['flower', 'flow', 'flight']], expected: 'fl' },
		{ id: 't2', args: [['dog', 'racecar', 'car']], expected: '' },
		{ id: 't3', args: [[]], expected: '' },
		{ id: 't4', args: [['a']], expected: 'a' },
		// One string is the prefix of the other: the answer is the whole shorter string.
		{ id: 't5', args: [['ab', 'a']], expected: 'a' },
		{ id: 't6', args: [['', 'b']], expected: '' },
		{ id: 't7', args: [['', '']], expected: '' },
		{ id: 't8', args: [['abc', 'abc', 'abc']], expected: 'abc' },
		{ id: 't9', args: [['interview', 'internet', 'interval', 'internal']], expected: 'inter' },
		{ id: 't10', args: [['cir', 'car']], expected: 'c' },
		{ id: 't11', args: [bigStrs], expected: stem }
	],
	correctnessHints: [
		'Look at which strings your code compares. Does the answer start both strings in the list AND every other string?',
		'Every string in the list has to start with the prefix, so a shorter string limits how long it can be. Do not read past the end of any string, and check the empty list and empty strings.',
		'Compare the strings character by character at the same position, stopping at the first position where any string differs or runs out. The characters before that position are the answer.'
	],
	optimization: {
		title: 'Optional: look for repeated work',
		goal: 'Your solution passes. As an optional exercise, ask how much of each string you really need to look at, and whether comparing every string against the others is necessary.',
		hints: [
			'Once one position disagrees, none of the characters after it can be part of the answer.',
			'The prefix can never be longer than the shortest string in the list.',
			'Start with the first string as the candidate and shorten it each time another string does not start with it, or compare position by position down all the strings and stop at the first disagreement.'
		]
	},
	knownStrategies: [
		{ name: 'Shorten a candidate against each string', time: 'O(total characters)', space: 'O(1)' },
		{
			name: 'Compare position by position (vertical scan)',
			time: 'O(total characters)',
			space: 'O(1)'
		}
	]
} satisfies ProblemDefinition
