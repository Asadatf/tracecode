import test from 'node:test'
import assert from 'node:assert/strict'
import { withSolvedTopics } from './summary-topics.ts'

const topics = { 'two-sum': 'arrays and loops', 'valid-anagram': 'strings and hashing' }

test('withSolvedTopics: swaps the slug for the problem’s topics', () => {
	assert.equal(
		withSolvedTopics(
			'You solved two-sum after some earlier unsuccessful attempts. Here’s one you haven’t started yet.',
			topics
		),
		'You solved recent problems based on arrays and loops after some earlier unsuccessful attempts. Here’s one you haven’t started yet.'
	)
})

test('withSolvedTopics: leaves any other summary untouched', () => {
	for (const summary of [
		'You’ve made progress on the problems you’ve tried. Here’s one you haven’t started yet.',
		'You solved unknown-slug after some earlier unsuccessful attempts.',
		'A model-written summary that mentions two-sum.'
	]) {
		assert.equal(withSolvedTopics(summary, topics), summary)
	}
})
