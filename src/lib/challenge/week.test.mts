import test from 'node:test'
import assert from 'node:assert/strict'
import {
	daysOfWeek,
	isIsoDate,
	isWeekClosed,
	shouldArchiveWeek,
	weekEndOf,
	weekStartOf,
	WEEK_CLOSE_GRACE_MS,
	WEEK_PENDING_PATIENCE_MS
} from './week.ts'

test('real calendar dates only', () => {
	for (const ok of ['2026-11-05', '2024-02-29', '2026-12-31', '2026-01-01'])
		assert.equal(isIsoDate(ok), true, ok)
	for (const bad of [
		'2026-02-30',
		'2025-02-29',
		'2026-13-01',
		'2026-11-5',
		'11-05-2026',
		'',
		'today',
		'2026-11-05T00:00',
		'../x'
	])
		assert.equal(isIsoDate(bad), false, bad)
})

test('a week starts on Monday (UTC) and every day of it maps to that Monday', () => {
	// 2026-11-02 is a Monday.
	for (const d of daysOfWeek('2026-11-02')) assert.equal(weekStartOf(d), '2026-11-02', d)
	assert.deepEqual(daysOfWeek('2026-11-02'), [
		'2026-11-02',
		'2026-11-03',
		'2026-11-04',
		'2026-11-05',
		'2026-11-06',
		'2026-11-07',
		'2026-11-08'
	])
	assert.equal(weekEndOf('2026-11-02'), '2026-11-08')
})

test('Sunday belongs to the week that is ending, Monday starts the next', () => {
	assert.equal(weekStartOf('2026-11-08'), '2026-11-02') // Sunday
	assert.equal(weekStartOf('2026-11-09'), '2026-11-09') // Monday
})

test('week boundaries cross month, year and leap-day edges', () => {
	assert.equal(weekStartOf('2026-12-31'), '2026-12-28')
	assert.equal(weekStartOf('2027-01-01'), '2026-12-28') // Friday in a week that began in December
	assert.equal(weekStartOf('2024-03-01'), '2024-02-26') // after the leap day
	assert.equal(weekStartOf('2024-02-29'), '2024-02-26')
	assert.equal(weekEndOf('2026-12-28'), '2027-01-03')
})

test('a week closes only after it ends plus a grace for late grading', () => {
	const closed = (iso: string) => isWeekClosed('2026-11-02', new Date(iso))
	assert.equal(closed('2026-11-08T23:59:59.999Z'), false)
	assert.equal(closed('2026-11-09T00:00:00.000Z'), false) // ended, still in grace
	assert.equal(
		closed(
			new Date(Date.parse('2026-11-09T00:00:00.000Z') + WEEK_CLOSE_GRACE_MS - 1).toISOString()
		),
		false
	)
	assert.equal(
		closed(new Date(Date.parse('2026-11-09T00:00:00.000Z') + WEEK_CLOSE_GRACE_MS).toISOString()),
		true
	)
})

test('a week is archived only when closed and nothing in it is still waiting to be graded', () => {
	const closedAt = new Date(Date.parse('2026-11-09T00:00:00.000Z') + WEEK_CLOSE_GRACE_MS)
	assert.equal(
		shouldArchiveWeek('2026-11-02', new Date('2026-11-08T12:00:00Z'), 0),
		false,
		'still running'
	)
	assert.equal(shouldArchiveWeek('2026-11-02', closedAt, 0), true)
	assert.equal(
		shouldArchiveWeek('2026-11-02', closedAt, 3),
		false,
		'a pending grading holds the archive'
	)
})

test('a stuck grading cannot hold a week open forever', () => {
	const patient = new Date(Date.parse('2026-11-09T00:00:00.000Z') + WEEK_PENDING_PATIENCE_MS)
	assert.equal(shouldArchiveWeek('2026-11-02', new Date(patient.getTime() - 1), 2), false)
	assert.equal(shouldArchiveWeek('2026-11-02', patient, 2), true)
})
