import { type ProblemDefinition } from '../problem'

// LeetCode 20 contract: 1 ≤ len ≤ 10⁴, only ()[]{}. The deeply nested test is
// capped at 2 000 pairs so a quadratic baseline still finishes inside the 5 s
// run budget in Pyodide, and so is the deep wrong-closer test (t25); the long
// flat tests use the full 10⁴ characters.
const DEPTH = 2000
const NESTED = '('.repeat(DEPTH) + ')'.repeat(DEPTH)

export const validParentheses = {
	slug: 'valid-parentheses',
	title: 'Valid Parentheses',
	entry: 'is_valid',
	params: [{ name: 's' }],
	difficulty: 'hard',
	conceptTags: ['strings', 'stacks'],
	statement: [
		'Given a string s made only of the characters ( ) [ ] { }, return True if the brackets are valid. Otherwise return False.',
		'A string is valid when every opening bracket is closed by the same kind of bracket, and the brackets close in the correct order. Your function must return a Python boolean.'
	],
	examples: [
		{ args: ['()[]{}'], output: true },
		{ args: ['(]'], output: false },
		{ args: ['([)]'], output: false }
	],
	starter:
		'def is_valid(s: str) -> bool:\n    # Return True if every bracket is closed by the same kind, in the right order.\n    # Start with any correct approach.\n    return False',
	tests: [
		{ id: 't1', args: ['()'], expected: true },
		{ id: 't2', args: ['()[]{}'], expected: true },
		{ id: 't3', args: ['(]'], expected: false },
		{ id: 't4', args: ['([)]'], expected: false },
		{ id: 't5', args: ['{[]}'], expected: true },
		{ id: 't6', args: ['('], expected: false },
		{ id: 't7', args: [')'], expected: false },
		{ id: 't8', args: ['(('], expected: false },
		{ id: 't9', args: ['))'], expected: false },
		{ id: 't10', args: [')('], expected: false },
		{ id: 't11', args: ['()('], expected: false },
		{ id: 't12', args: ['()]'], expected: false },
		{ id: 't13', args: ['(()'], expected: false },
		{ id: 't14', args: ['[({})]'], expected: true },
		{ id: 't15', args: ['((()))'], expected: true },
		{ id: 't16', args: ['{[()]}[]({})'], expected: true },
		{ id: 't17', args: ['([{}])'], expected: true },
		{ id: 't18', args: ['{[}]'], expected: false },
		{ id: 't19', args: ['[(])'], expected: false },
		{ id: 't20', args: ['(){}}{'], expected: false },
		{ id: 't21', args: ['(}{)'], expected: false },
		{ id: 't22', args: [NESTED], expected: true },
		{ id: 't23', args: ['()'.repeat(5000)], expected: true },
		{ id: 't24', args: ['('.repeat(DEPTH - 1) + ']' + ')'.repeat(DEPTH - 1)], expected: false },
		{ id: 't25', args: ['('.repeat(DEPTH) + ')'.repeat(DEPTH - 1) + ']'], expected: false },
		{ id: 't26', args: ['()'.repeat(4999) + '('], expected: false }
	],
	correctnessHints: [
		'Pick a failing input and classify it: closed in the wrong order like "([)]", closed too early like ")", or left open like "(".',
		'Counting brackets of each kind is not enough: order matters and the kinds must pair up. A closing bracket is only valid if it matches the most recent opening bracket that is still unclosed.',
		'Decide what to remember about the openers not yet closed, and what to check when a closer arrives (nothing open, or the wrong kind, makes the string invalid). After the last character, anything still open also makes it invalid.'
	],
	optimization: {
		title: 'Optional: avoid re-reading the string',
		goal: 'Your solution passes. As an optional exercise, ask whether you can decide validity in a single left-to-right pass, remembering only what is still unmatched.',
		hints: [
			'If your approach starts over from the beginning after every match it finds, it re-reads parts of the string that have not changed.',
			'A closer can only ever match the most recent opener that is still unmatched, so that is the only one you need to look at, and you can decide right when you read the closer.',
			'Read the string once, left to right. Keep a last-in-first-out collection of unmatched openers (or of the closers they expect). On a closer, compare it with the latest entry and discard that entry. At the end, nothing may be left.'
		]
	},
	knownStrategies: [
		{ name: 'Repeated pair removal', time: 'O(n²)', space: 'O(n)' },
		{ name: 'Stack', time: 'O(n)', space: 'O(n)' }
	]
} satisfies ProblemDefinition
