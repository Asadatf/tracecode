import test from 'node:test'
import assert from 'node:assert/strict'
import { relativeTime } from './relative-time.ts'

const now = new Date('2026-11-03T12:00:00Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()

test('relativeTime: under a minute reads as now', () => {
	assert.equal(relativeTime(ago(10), now, 'en'), 'now')
})

test('relativeTime: minutes, hours and days', () => {
	assert.match(relativeTime(ago(12 * 60), now, 'en'), /^12 min\. ago$/)
	assert.match(relativeTime(ago(2 * 3600), now, 'en'), /^2 hr\. ago$/)
	assert.equal(relativeTime(ago(24 * 3600), now, 'en'), 'yesterday')
	assert.match(relativeTime(ago(3 * 24 * 3600), now, 'en'), /^3 days ago$/)
})
