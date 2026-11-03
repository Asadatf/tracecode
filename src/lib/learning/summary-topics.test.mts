import test from 'node:test'
import assert from 'node:assert/strict'
import { chipLabel, insightSummary } from './summary-topics.ts'

const topics = { 'two-sum': 'array and loop', 'valid-anagram': 'string and hashing' }

test('insightSummary: names the solved problem’s topics instead of its slug', () => {
	assert.equal(
		insightSummary(
			'You solved two-sum after some earlier unsuccessful attempts. Here’s one you haven’t started yet.',
			topics
		),
		'You’ve solved array and loop problems after earlier attempts. Ready for a new challenge?'
	)
})

test('insightSummary: leaves any other summary untouched', () => {
	for (const summary of [
		'You’ve made progress on the problems you’ve tried. Here’s one you haven’t started yet.',
		'You solved unknown-slug after some earlier unsuccessful attempts.',
		'A model-written summary that mentions two-sum.'
	]) {
		assert.equal(insightSummary(summary, topics), summary)
	}
})

test('chipLabel: title-cases a concept tag', () => {
	assert.equal(chipLabel('binary-search'), 'Binary Search')
	assert.equal(chipLabel('arrays'), 'Arrays')
})
