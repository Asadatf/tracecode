import test from 'node:test'
import assert from 'node:assert/strict'
import { activityAttemptsQuery, legacyActivityAttemptsQuery } from './activity-query.ts'
import { STREAK_WINDOW_DAYS, addDays } from '../streak/streak.ts'

test('the activity query is scoped to the user, to completed attempts, and to a bounded window', () => {
	const query = activityAttemptsQuery('user-1', '2026-11-10')
	assert.equal(query.where.userId, 'user-1')
	assert.equal(query.where.status, 'completed')
	assert.equal(
		query.where.createdAt.gte.toISOString(),
		`${addDays('2026-11-10', -STREAK_WINDOW_DAYS)}T00:00:00.000Z`
	)
})

test('the activity query never reads source text, results or replays', () => {
	assert.deepEqual(Object.keys(activityAttemptsQuery('u', '2026-11-10').select).sort(), [
		'allPassed',
		'createdAt',
		'meaningful',
		'problemSlug',
		'status'
	])
})

test('legacy (null) attempts are kept; only an explicit false is excluded', () => {
	// An explicit OR, because a `<> false` filter would silently drop the nulls.
	assert.deepEqual(activityAttemptsQuery('u', '2026-11-10').where.OR, [
		{ meaningful: null },
		{ meaningful: true }
	])
})

test('the pre-migration fallback never names the meaningful column', () => {
	const query = legacyActivityAttemptsQuery('u', '2026-11-10')
	assert.equal(JSON.stringify(query).includes('meaningful'), false)
	assert.equal(query.where.userId, 'u')
	assert.equal(query.where.status, 'completed')
})
