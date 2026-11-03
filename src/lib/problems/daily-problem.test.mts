import test from 'node:test'
import assert from 'node:assert/strict'
import { isoDate, problemForDate } from './daily-problem.ts'

const slugs = ['two-sum', 'contains-duplicate', 'valid-anagram', 'move-zeroes']

test('problemForDate: the same date always gives the same problem', () => {
	assert.equal(problemForDate(slugs, '2026-11-03'), problemForDate(slugs, '2026-11-03'))
})

test('problemForDate: always a catalogue slug, and dates spread across it', () => {
	const seen = new Set<string>()
	for (let day = 1; day <= 30; day++) {
		const slug = problemForDate(slugs, isoDate(2026, 10, day))
		assert.ok(slug != null && slugs.includes(slug))
		seen.add(slug)
	}
	assert.equal(seen.size, slugs.length)
})

test('problemForDate: an empty catalogue has no problem', () => {
	assert.equal(problemForDate([], '2026-11-03'), undefined)
})

test('isoDate: formats a UTC day and rolls month ends', () => {
	assert.equal(isoDate(2026, 10, 3), '2026-11-03')
	assert.equal(isoDate(2026, 10, 31), '2026-12-01')
})
