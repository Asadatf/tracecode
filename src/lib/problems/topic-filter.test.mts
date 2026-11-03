import test from 'node:test'
import assert from 'node:assert/strict'
import { filterByTopic, topicsOf } from './topic-filter.ts'

const rows = [
	{ slug: 'two-sum', tags: ['Arrays', 'Loops'] },
	{ slug: 'contains-duplicate', tags: ['Arrays', 'Hashing'] },
	{ slug: 'valid-anagram', tags: ['Strings', 'Hashing'] }
]

test('topicsOf: each topic once, in catalogue order', () => {
	assert.deepEqual(topicsOf(rows), ['Arrays', 'Loops', 'Hashing', 'Strings'])
	assert.deepEqual(topicsOf([]), [])
})

test('filterByTopic: a topic keeps only matching rows, null keeps all', () => {
	assert.deepEqual(
		filterByTopic(rows, 'Hashing').map((row) => row.slug),
		['contains-duplicate', 'valid-anagram']
	)
	assert.equal(filterByTopic(rows, null).length, 3)
	assert.deepEqual(filterByTopic(rows, 'Graphs'), [])
})
