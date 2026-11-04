import test from 'node:test'
import assert from 'node:assert/strict'
import { activeDaysOf, addDays, computeStreak, utcDay } from './streak.ts'

const today = '2026-11-10'
const days = (...offsets: number[]) => offsets.map((offset) => addDays(today, offset))

test('days are UTC calendar days, and date arithmetic crosses month and year ends', () => {
	assert.equal(utcDay('2026-11-03T23:59:59.999Z'), '2026-11-03')
	assert.equal(utcDay('2026-11-04T00:00:00.000Z'), '2026-11-04')
	// 23:30 in UTC-5 is already the next UTC day; the rule is UTC, not local time.
	assert.equal(utcDay('2026-11-04T04:30:00.000-05:00'), '2026-11-04')
	assert.equal(addDays('2026-11-30', 1), '2026-12-01')
	assert.equal(addDays('2026-12-31', 1), '2027-01-01')
	assert.equal(addDays('2026-03-01', -1), '2026-02-28')
})

test('only completed attempts qualify; each day counts once', () => {
	const stamp = (iso: string, status: string) => ({ createdAt: iso, status })
	assert.deepEqual(
		activeDaysOf([
			stamp('2026-11-08T09:00:00Z', 'completed'),
			stamp('2026-11-08T21:00:00Z', 'completed'),
			stamp('2026-11-09T09:00:00Z', 'syntax_error'),
			stamp('2026-11-09T10:00:00Z', 'engine_error'),
			stamp('2026-11-09T11:00:00Z', 'timeout'),
			stamp('2026-11-10T09:00:00Z', 'completed')
		]),
		['2026-11-08', '2026-11-10']
	)
	assert.deepEqual(activeDaysOf([]), [])
})

test('days 1 and 2 leave the flame neutral', () => {
	assert.deepEqual(computeStreak(days(0), today), { current: 1, longest: 1, active: false })
	assert.deepEqual(computeStreak(days(-1, 0), today), { current: 2, longest: 2, active: false })
})

test('day 3 lights the flame, and day 4 onward keeps counting', () => {
	assert.deepEqual(computeStreak(days(-2, -1, 0), today), { current: 3, longest: 3, active: true })
	assert.deepEqual(computeStreak(days(-3, -2, -1, 0), today), {
		current: 4,
		longest: 4,
		active: true
	})
	assert.equal(computeStreak(days(-9, -8, -7, -6, -5, -4, -3, -2, -1, 0), today).current, 10)
})

test('a chain ending yesterday is still alive: today is not over yet', () => {
	assert.deepEqual(computeStreak(days(-3, -2, -1), today), { current: 3, longest: 3, active: true })
})

test('a whole day with nothing in it breaks the chain and the flame goes out', () => {
	const broken = computeStreak(days(-5, -4, -3, -2), today)
	assert.deepEqual(broken, { current: 0, longest: 4, active: false })
	// Qualifying practice after the break starts a NEW chain at 1.
	assert.deepEqual(computeStreak(days(-5, -4, -3, -2, 0), today), {
		current: 1,
		longest: 4,
		active: false
	})
})

test('longest streak is the best run anywhere in the history, not just the current one', () => {
	const stats = computeStreak(days(-20, -19, -18, -17, -16, -9, -8, 0), today)
	assert.equal(stats.longest, 5)
	assert.equal(stats.current, 1)
})

test('no activity means no streak, never an invented one', () => {
	assert.deepEqual(computeStreak([], today), { current: 0, longest: 0, active: false })
})

test('duplicate days in the input do not inflate the count', () => {
	assert.equal(computeStreak([...days(-1, 0), ...days(-1, 0), ...days(0)], today).current, 2)
})

test('the boundary is exact: 23:59 UTC and 00:00 UTC are different days', () => {
	const lateYesterday = '2026-11-09T23:59:59.999Z'
	const earlyToday = '2026-11-10T00:00:00.000Z'
	const active = activeDaysOf([
		{ createdAt: lateYesterday, status: 'completed' },
		{ createdAt: earlyToday, status: 'completed' }
	])
	assert.deepEqual(active, ['2026-11-09', '2026-11-10'])
	assert.equal(computeStreak(active, today).current, 2)
})

// M9A.1: what earns a day, end to end through the pure rules. `meaningful` is the
// server's verdict stored on the attempt; undefined/null is a legacy attempt.
const at = (iso: string, status = 'completed', meaningful?: boolean | null) => ({
	createdAt: iso,
	status,
	meaningful
})

test('a solve, a failing genuine run, and a reattempt of a solved problem all qualify', () => {
	// Qualification is independent of allPassed and of whether the problem was solved
	// before: only status and the server's meaningful verdict are consulted.
	assert.deepEqual(activeDaysOf([at('2026-11-08T09:00:00Z', 'completed', true)]), ['2026-11-08'])
	assert.deepEqual(activeDaysOf([at('2026-11-09T09:00:00Z', 'completed', true)]), ['2026-11-09'])
})

test('untouched or whitespace/comment-only runs do not qualify; legacy attempts still do', () => {
	assert.deepEqual(activeDaysOf([at('2026-11-08T09:00:00Z', 'completed', false)]), [])
	assert.deepEqual(activeDaysOf([at('2026-11-08T09:00:00Z', 'completed', null)]), ['2026-11-08'])
	assert.deepEqual(activeDaysOf([at('2026-11-08T09:00:00Z', 'completed', undefined)]), [
		'2026-11-08'
	])
})

test('a meaningful run that did not complete never qualifies', () => {
	for (const status of ['syntax_error', 'timeout', 'engine_error']) {
		assert.deepEqual(activeDaysOf([at('2026-11-08T09:00:00Z', status, true)]), [], status)
	}
})

test('many qualifying runs on one UTC date are one day; the midnight boundary splits days', () => {
	assert.deepEqual(
		activeDaysOf([
			at('2026-11-08T00:00:00.000Z', 'completed', true),
			at('2026-11-08T12:00:00Z', 'completed', true),
			at('2026-11-08T23:59:59.999Z', 'completed', true),
			at('2026-11-09T00:00:00.000Z', 'completed', true)
		]),
		['2026-11-08', '2026-11-09']
	)
})

test('a starter-only run on a day cannot rescue a streak, and a real run alongside it still counts', () => {
	const rows = [
		at('2026-11-08T09:00:00Z', 'completed', true),
		at('2026-11-09T09:00:00Z', 'completed', false),
		at('2026-11-10T09:00:00Z', 'completed', true),
		at('2026-11-10T10:00:00Z', 'completed', false)
	]
	const stats = computeStreak(activeDaysOf(rows), '2026-11-10')
	assert.deepEqual(stats, { current: 1, longest: 1, active: false })
})

test('three consecutive qualifying days light the flame; a missed day breaks it but keeps the longest', () => {
	const run = (...offsets: number[]) =>
		activeDaysOf(offsets.map((o) => at(`${addDays(today, o)}T09:00:00Z`, 'completed', true)))
	assert.deepEqual(computeStreak(run(-2, -1, 0), today), { current: 3, longest: 3, active: true })
	assert.deepEqual(computeStreak(run(-5, -4, -3, -2, 0), today), {
		current: 1,
		longest: 4,
		active: false
	})
	assert.deepEqual(computeStreak(run(-6, -5, -4, -3), today), {
		current: 0,
		longest: 4,
		active: false
	})
})
