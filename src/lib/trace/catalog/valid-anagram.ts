import { type ProblemDefinition } from '../problem'
import { cycled, shuffled } from './test-data'

// LeetCode 242 contract: 1 ≤ len ≤ 5·10⁴, lowercase English letters only. The
// large tests stay at 2·10⁴ so the page payload and the 5 s run budget stay small.
const LARGE = 20_000
const largeS = cycled('abcdefghijklmnopqrstuvwxyz', LARGE)
const largeShuffled = shuffled([...largeS], 7).join('')
// Same length, one letter swapped for a different one: the counts no longer match.
const oneLetterOff = largeShuffled.slice(0, LARGE - 1) + (largeShuffled.endsWith('z') ? 'y' : 'z')

export const validAnagram = {
	slug: 'valid-anagram',
	title: 'Valid Anagram',
	entry: 'is_anagram',
	params: [{ name: 's' }, { name: 't' }],
	difficulty: 'easy',
	conceptTags: ['strings', 'hashing'],
	statement: [
		'Given two strings s and t, return True if t can be formed by rearranging the letters of s, using every letter of s exactly once. Otherwise return False.',
		'Both strings contain only lowercase English letters a–z and have at least one character. Your function must return a Python boolean.'
	],
	examples: [
		{ args: ['anagram', 'nagaram'], output: true },
		{ args: ['rat', 'car'], output: false }
	],
	starter:
		'def is_anagram(s: str, t: str) -> bool:\n    # Return True if t is a rearrangement of the letters of s.\n    # Start with any correct approach.\n    return False',
	visibleTestIds: ['t1', 't2', 't3', 't5', 't7', 't8'],
	tests: [
		{ id: 't1', args: ['anagram', 'nagaram'], expected: true },
		{ id: 't2', args: ['rat', 'car'], expected: false },
		{ id: 't3', args: ['a', 'a'], expected: true },
		{ id: 't4', args: ['a', 'b'], expected: false },
		{ id: 't5', args: ['ab', 'a'], expected: false },
		{ id: 't6', args: ['a', 'ab'], expected: false },
		{ id: 't7', args: ['aab', 'abb'], expected: false },
		{ id: 't8', args: ['aabb', 'abab'], expected: true },
		{ id: 't9', args: ['zzzz', 'zzzz'], expected: true },
		{ id: 't10', args: ['listen', 'silent'], expected: true },
		{ id: 't11', args: ['aacc', 'ccac'], expected: false },
		{ id: 't12', args: ['ac', 'bb'], expected: false },
		{
			id: 't13',
			args: ['abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba'],
			expected: true
		},
		{ id: 't14', args: ['aabbbc', 'abcabb'], expected: true },
		{ id: 't15', args: ['abcc', 'abbc'], expected: false },
		{ id: 't16', args: [largeS, largeShuffled], expected: true },
		{ id: 't17', args: [largeS, oneLetterOff], expected: false },
		{ id: 't18', args: ['a'.repeat(LARGE), 'a'.repeat(LARGE - 1)], expected: false }
	],
	correctnessHints: [
		'Compare a failing input with the expected result: does your code look at how many times each letter appears, or only at which letters appear?',
		'The same set of letters is not enough ("aab" and "abb"), and strings of different lengths can never match. What must be equal besides the letters themselves?',
		'Make the two strings directly comparable: either put both into one canonical order, or tally how often each letter occurs in each string and compare the tallies.'
	],
	optimization: {
		title: 'Optional: look for avoidable work',
		goal: 'Your solution passes. As an optional exercise, ask whether the answer really needs the letters put in order, and what it would cost to count them instead.',
		hints: [
			'Putting every letter in order does more than the question needs: the answer depends only on how many times each letter occurs.',
			'Counting occurrences takes one pass over each string and needs no ordering. With a fixed alphabet, the tally has the same size however long the strings are.',
			'Tally one string, then let the other string cancel that tally. A length mismatch, or a count that would drop below zero, settles the answer early.'
		]
	},
	knownStrategies: [
		{ name: 'Sort both strings', time: 'O(n log n)', space: 'Depends on implementation' },
		{ name: 'Frequency counting', time: 'O(n)', space: 'O(1) for a fixed alphabet' }
	]
} satisfies ProblemDefinition
