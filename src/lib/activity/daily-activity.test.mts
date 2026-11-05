import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyActivity, type ActivityAttempt } from './daily-activity.ts'
import { activeDaysOf, computeStreak } from '../streak/streak.ts'

const run = (
	iso: string,
	problemSlug: string,
	allPassed = false,
	status = 'completed',
	meaningful: boolean | null | undefined = true
): ActivityAttempt => ({ createdAt: iso, status, problemSlug, allPassed, meaningful })

test('no attempts means no activity', () => {
	assert.deepEqual(buildDailyActivity([]), [])
})

test('many runs on one UTC day are one entry whose intensity counts every run', () => {
	const days = buildDailyActivity([
		run('2026-11-08T09:00:00Z', 'two-sum'),
		run('2026-11-08T10:00:00Z', 'two-sum'),
		run('2026-11-08T23:59:59.999Z', 'two-sum', true)
	])
	assert.deepEqual(days, [{ day: '2026-11-08', attempts: 3, problems: 1, solved: 1 }])
})

test('failing meaningful runs and reattempts of a solved problem both count as practice', () => {
	const days = buildDailyActivity([
		run('2026-11-08T09:00:00Z', 'two-sum', false),
		run('2026-11-09T09:00:00Z', 'two-sum', true),
		run('2026-11-10T09:00:00Z', 'two-sum', true)
	])
	assert.deepEqual(
		days.map((d) => [d.day, d.attempts, d.solved]),
		[
			['2026-11-08', 1, 0],
			['2026-11-09', 1, 1],
			['2026-11-10', 1, 1]
		]
	)
})

test('distinct problems and distinct solves are counted once per day', () => {
	const [day] = buildDailyActivity([
		run('2026-11-08T08:00:00Z', 'two-sum', true),
		run('2026-11-08T09:00:00Z', 'two-sum', true),
		run('2026-11-08T10:00:00Z', 'binary-search', false),
		run('2026-11-08T11:00:00Z', 'valid-anagram', true)
	])
	assert.deepEqual(day, { day: '2026-11-08', attempts: 4, problems: 3, solved: 2 })
})

test('untouched-starter runs and runs that did not complete add nothing', () => {
	assert.deepEqual(
		buildDailyActivity([
			run('2026-11-08T09:00:00Z', 'two-sum', false, 'completed', false),
			run('2026-11-08T09:01:00Z', 'two-sum', false, 'syntax_error'),
			run('2026-11-08T09:02:00Z', 'two-sum', false, 'timeout'),
			run('2026-11-08T09:03:00Z', 'two-sum', false, 'engine_error')
		]),
		[]
	)
	// A starter run beside a real run does not inflate the real day's intensity.
	const [day] = buildDailyActivity([
		run('2026-11-08T09:00:00Z', 'two-sum', false, 'completed', false),
		run('2026-11-08T10:00:00Z', 'two-sum', false, 'completed', true)
	])
	assert.equal(day?.attempts, 1)
})

test('historical attempts (meaningful null/undefined) stay visible', () => {
	const days = buildDailyActivity([
		run('2026-01-02T09:00:00Z', 'two-sum', true, 'completed', null),
		run('2026-01-03T09:00:00Z', 'two-sum', false, 'completed', undefined)
	])
	assert.deepEqual(
		days.map((d) => d.day),
		['2026-01-02', '2026-01-03']
	)
})

test('UTC midnight splits days; month, year and leap-day boundaries are real days', () => {
	const days = buildDailyActivity([
		run('2024-02-28T23:59:59.999Z', 'a'),
		run('2024-02-29T00:00:00.000Z', 'a'),
		run('2024-02-29T23:59:59.999Z', 'a'),
		run('2024-03-01T00:00:00.000Z', 'a'),
		run('2025-12-31T23:59:59Z', 'a'),
		run('2026-01-01T00:00:00Z', 'a'),
		// 23:30 in UTC-5 is already the next UTC day.
		run('2026-03-10T23:30:00-05:00', 'a')
	])
	assert.deepEqual(
		days.map((d) => [d.day, d.attempts]),
		[
			['2024-02-28', 1],
			['2024-02-29', 2],
			['2024-03-01', 1],
			['2025-12-31', 1],
			['2026-01-01', 1],
			['2026-03-11', 1]
		]
	)
})

test('the output is oldest first whatever order the rows arrive in, and is idempotent', () => {
	const rows = [
		run('2026-11-10T09:00:00Z', 'a'),
		run('2026-11-08T09:00:00Z', 'a'),
		run('2026-11-09T09:00:00Z', 'a')
	]
	const once = buildDailyActivity(rows)
	assert.deepEqual(
		once.map((d) => d.day),
		['2026-11-08', '2026-11-09', '2026-11-10']
	)
	assert.deepEqual(buildDailyActivity([...rows].reverse()), once)
	assert.deepEqual(buildDailyActivity(rows), once)
})

test('a retried or duplicated write darkens the cell but never adds a streak day', () => {
	const single = [run('2026-11-10T09:00:00Z', 'a', true)]
	const duplicated = [...single, ...single, ...single]
	assert.equal(buildDailyActivity(duplicated)[0]?.attempts, 3)
	assert.deepEqual(
		buildDailyActivity(duplicated).map((d) => d.day),
		buildDailyActivity(single).map((d) => d.day)
	)
})

test('the heatmap days ARE the streak days, so the two can never disagree', () => {
	const today = '2026-11-10'
	const rows = [
		run('2026-11-05T09:00:00Z', 'a'),
		run('2026-11-07T09:00:00Z', 'a', false, 'completed', false),
		run('2026-11-08T09:00:00Z', 'a'),
		run('2026-11-08T11:00:00Z', 'b'),
		run('2026-11-09T09:00:00Z', 'a', false, 'timeout'),
		run('2026-11-09T10:00:00Z', 'a', false, 'completed', null),
		run('2026-11-10T09:00:00Z', 'a')
	]
	const heatmapDays = buildDailyActivity(rows).map((d) => d.day)
	assert.deepEqual(heatmapDays, activeDaysOf(rows))
	assert.deepEqual(computeStreak(heatmapDays, today), { current: 3, longest: 3, active: true })
})
