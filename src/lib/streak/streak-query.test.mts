import test from 'node:test'
import assert from 'node:assert/strict'
import { streakAttemptsQuery } from './streak-query.ts'
import { STREAK_WINDOW_DAYS, addDays } from './streak.ts'

test('the streak query is scoped to the user, to completed attempts, and to a bounded window', () => {
	const query = streakAttemptsQuery('user-1', '2026-11-10')
	assert.equal(query.where.userId, 'user-1')
	assert.equal(query.where.status, 'completed')
	assert.equal(
		query.where.createdAt.gte.toISOString(),
		`${addDays('2026-11-10', -STREAK_WINDOW_DAYS)}T00:00:00.000Z`
	)
})

test('the streak query selects only the two columns it needs', () => {
	assert.deepEqual(Object.keys(streakAttemptsQuery('u', '2026-11-10').select).sort(), [
		'createdAt',
		'status'
	])
})
