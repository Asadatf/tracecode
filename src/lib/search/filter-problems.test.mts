import test from 'node:test'
import assert from 'node:assert/strict'
import { filterProblems, MAX_SEARCH_RESULTS, type SearchableProblem } from './filter-problems.ts'

const problems: SearchableProblem[] = [
	{ slug: 'two-sum', title: 'Two Sum', topics: 'Arrays · Loops' },
	{ slug: 'contains-duplicate', title: 'Contains Duplicate', topics: 'Arrays · Hashing' },
	{ slug: 'valid-anagram', title: 'Valid Anagram', topics: 'Strings · Hashing' }
]

test('filterProblems: empty or blank query matches nothing', () => {
	assert.deepEqual(filterProblems(problems, ''), [])
	assert.deepEqual(filterProblems(problems, '   '), [])
})

test('filterProblems: matches title case-insensitively', () => {
	assert.deepEqual(
		filterProblems(problems, 'TWO').map((p) => p.slug),
		['two-sum']
	)
})

test('filterProblems: matches a topic', () => {
	assert.deepEqual(
		filterProblems(problems, 'hashing').map((p) => p.slug),
		['contains-duplicate', 'valid-anagram']
	)
})

test('filterProblems: title matches rank before topic-only matches', () => {
	const list: SearchableProblem[] = [
		{ slug: 'a', title: 'Alpha', topics: 'Sum' },
		{ slug: 'b', title: 'Sum Path', topics: 'Trees' }
	]
	assert.deepEqual(
		filterProblems(list, 'sum').map((p) => p.slug),
		['b', 'a']
	)
})

test('filterProblems: no match and the result cap', () => {
	assert.deepEqual(filterProblems(problems, 'zzz'), [])
	const many = Array.from({ length: 20 }, (_, i) => ({
		slug: `p${i}`,
		title: `Problem ${i}`,
		topics: 'Arrays'
	}))
	assert.equal(filterProblems(many, 'problem').length, MAX_SEARCH_RESULTS)
})
