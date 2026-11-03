import { type ProblemDefinition } from '../problem'
import { cycled } from './test-data'

// LeetCode 125 contract, in printable ASCII: 1 ≤ len ≤ 2·10⁵ there; capped at
// 20 000 characters here. Only letters and digits count, case is ignored.
const HALF = 5000
const half = cycled('abcXYZ019', HALF)
const mirrored = (text: string) => [...text].reverse().join('')
// Punctuation and spaces between every character must be skipped.
const noisy = (text: string) => [...text].map((ch, i) => (i % 3 === 0 ? `${ch}, ` : ch)).join('')
const longPalindrome = noisy(half + mirrored(half))
const longMiddleBreak = noisy(half + 'q' + mirrored(half).slice(1))
const longEndBreak = noisy(half + mirrored(half)) + '7'

export const validPalindrome = {
	slug: 'valid-palindrome',
	title: 'Valid Palindrome',
	entry: 'is_palindrome',
	params: [{ name: 's' }],
	difficulty: 'easy',
	conceptTags: ['strings', 'two-pointers'],
	statement: [
		'Given a string s, return True if it reads the same forwards and backwards once you keep only its letters and digits and ignore upper and lower case. Otherwise return False.',
		'Spaces and punctuation are ignored entirely. A string with no letters or digits left counts as a palindrome. Your function must return a Python boolean.'
	],
	examples: [
		{ args: ['A man, a plan, a canal: Panama'], output: true },
		{ args: ['race a car'], output: false },
		{ args: [' '], output: true }
	],
	starter:
		'def is_palindrome(s: str) -> bool:\n    # Keep only letters and digits, ignore case, and check it reads the same both ways.\n    return False',
	tests: [
		{ id: 't1', args: ['A man, a plan, a canal: Panama'], expected: true },
		{ id: 't2', args: ['race a car'], expected: false },
		{ id: 't3', args: [' '], expected: true },
		{ id: 't4', args: ['a'], expected: true },
		{ id: 't5', args: ['.,'], expected: true },
		{ id: 't6', args: ['ab'], expected: false },
		{ id: 't7', args: ['aa'], expected: true },
		{ id: 't8', args: ['0P'], expected: false },
		{ id: 't9', args: ['abba'], expected: true },
		{ id: 't10', args: ['abcba'], expected: true },
		{ id: 't11', args: ['abca'], expected: false },
		{ id: 't12', args: ["No 'x' in Nixon"], expected: true },
		{ id: 't13', args: ['Was it a car or a cat I saw?'], expected: true },
		{ id: 't14', args: ['12321'], expected: true },
		{ id: 't15', args: ['1a2'], expected: false },
		{ id: 't16', args: ['Aa'], expected: true },
		{ id: 't17', args: ['a.b,a'], expected: true },
		{ id: 't18', args: ['ab_a'], expected: true },
		{ id: 't19', args: [longPalindrome], expected: true },
		{ id: 't20', args: [longMiddleBreak], expected: false },
		{ id: 't21', args: [longEndBreak], expected: false }
	],
	arrayVar: 's',
	pointerVars: [
		['left', 's'],
		['right', 's'],
		['i', 's'],
		['j', 's']
	],
	correctnessHints: [
		'Take a failing input and write out only the characters that count, in lower case. Does that cleaned-up text read the same backwards?',
		'Only letters and digits count: spaces, commas, colons, apostrophes and underscores are all skipped, and "A" matches "a". Digits are kept, so "0P" is not a palindrome.',
		'Either build the cleaned-up lower-case text first and compare it with its reverse, or compare characters from both ends, skipping anything that is not a letter or digit.'
	],
	optimization: {
		title: 'Optional: check it without building a second string',
		goal: 'Your solution passes. As an optional exercise, ask whether you need a cleaned-up copy of the string, or whether you can check it where it is.',
		hints: [
			'A cleaned-up copy, and its reverse, hold about as many characters as the input, so the extra memory grows with the input.',
			'A palindrome check only ever compares the first unchecked character with the last unchecked one.',
			'Keep one index at each end. Move each one past characters that do not count, compare the two in lower case, then move both inwards until they meet.'
		]
	},
	knownStrategies: [
		{ name: 'Clean, then compare with the reverse', time: 'O(n)', space: 'O(n)' },
		{ name: 'Two pointers from both ends', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
