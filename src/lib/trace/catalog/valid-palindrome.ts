import { type ProblemDefinition } from '../problem'

// Contract: s is printable ASCII, 0 ≤ len ≤ 2000. "Alphanumeric" means ASCII letters and digits
// only (a–z, A–Z, 0–9); every other character, including spaces and underscores, is ignored, and
// letter case does not matter. An empty string, or one with nothing alphanumeric, is a palindrome.
const bigHalf = 'ab,c d'.repeat(165) + 'x'
const bigPalindrome = bigHalf + [...bigHalf].reverse().join('')
// One letter near the front changed, so its mirror no longer matches.
const bigNearMiss = bigPalindrome.slice(0, 3) + 'Z' + bigPalindrome.slice(4)

export const validPalindrome = {
	slug: 'valid-palindrome',
	title: 'Valid Palindrome',
	entry: 'is_palindrome',
	params: [{ name: 's' }],
	difficulty: 'easy',
	conceptTags: ['strings', 'two-pointers'],
	statement: [
		'A phrase is a palindrome if, after you make every letter lowercase and ignore every character that is not a letter or a digit, it reads the same from the front and from the back.',
		'Given a string s, return True if it is a palindrome and False otherwise. Only the ASCII letters a–z and A–Z and the digits 0–9 count; spaces, punctuation and underscores are skipped. A string with nothing to compare, such as "" or " ", is a palindrome. Return a Python boolean.'
	],
	examples: [
		{ args: ['A man, a plan, a canal: Panama'], output: true },
		{ args: ['race a car'], output: false },
		{ args: [' '], output: true }
	],
	starter:
		'def is_palindrome(s: str) -> bool:\n    # Return True if the letters and digits of s read the same both ways,\n    # ignoring case and every other character.\n    return False',
	visibleTestIds: ['t1', 't2', 't3', 't5', 't6', 't10'],
	tests: [
		{ id: 't1', args: ['A man, a plan, a canal: Panama'], expected: true },
		{ id: 't2', args: ['race a car'], expected: false },
		{ id: 't3', args: [' '], expected: true },
		{ id: 't4', args: [''], expected: true },
		// A digit and a letter that look alike are different characters.
		{ id: 't5', args: ['0P'], expected: false },
		{ id: 't6', args: ['.,!?'], expected: true },
		{ id: 't7', args: ["No 'x' in Nixon"], expected: true },
		{ id: 't8', args: ['ab'], expected: false },
		// Underscores are not alphanumeric, so they are skipped too.
		{ id: 't9', args: ['ab_a'], expected: true },
		{ id: 't10', args: ['Aa'], expected: true },
		{ id: 't11', args: [bigPalindrome], expected: true },
		{ id: 't12', args: [bigNearMiss], expected: false }
	],
	correctnessHints: [
		'Look at which characters your code compares. Does the string "A man, a plan, a canal: Panama" ever compare a comma or a space, or an uppercase A with a lowercase a?',
		'Decide first what counts: lowercase every letter, and skip anything that is not a letter or a digit. Digits matter: "0P" is not a palindrome because 0 and p are different characters.',
		'Either build a cleaned copy and compare it with its reverse, or walk two indexes inward and skip over characters that do not count before comparing.'
	],
	optimization: {
		title: 'Optional: look for avoidable storage',
		goal: 'Your solution passes. As an optional exercise, ask whether you need to build a second, cleaned string at all, or whether you can compare characters where they already are.',
		hints: [
			'A cleaned copy of the string holds characters that are already in s, so its size grows with the input.',
			'Two indexes, one near each end, can move toward each other and look at the original characters directly.',
			'Move the left index forward past characters that do not count, move the right index backward the same way, then compare the two characters ignoring case. Stop when the indexes meet.'
		]
	},
	knownStrategies: [
		{ name: 'Clean then compare with the reverse', time: 'O(n)', space: 'O(n)' },
		{ name: 'Two pointers on the original', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
