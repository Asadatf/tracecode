import test from 'node:test'
import assert from 'node:assert/strict'
import {
	EXAM_SCHEDULE,
	SCHEDULE_VERSION,
	elapsedSeconds,
	examDateOf,
	examTimes,
	remainingSeconds,
	timePhase
} from './schedule.ts'

// specs/features/daily-exam.md AC1, AC3, AC8, AC18, AC30 — the fixed UTC schedule.

const iso = (d: Date) => d.toISOString()

test('AC1: every exam opens 15:00, admits until 15:10, closes 15:30, results by 16:30, public at midnight', () => {
	const t = examTimes('2026-11-20')
	assert.equal(iso(t.opensAt), '2026-11-20T15:00:00.000Z')
	assert.equal(iso(t.lateEntryUntil), '2026-11-20T15:10:00.000Z')
	assert.equal(iso(t.closesAt), '2026-11-20T15:30:00.000Z')
	assert.equal(iso(t.resultsDueAt), '2026-11-20T16:30:00.000Z')
	assert.equal(iso(t.publishAt), '2026-11-21T00:00:00.000Z')
	assert.equal(iso(t.retentionUntil), '2027-02-19T00:00:00.000Z')
	assert.equal(SCHEDULE_VERSION, 'schedule@1')
	assert.equal(EXAM_SCHEDULE.durationMin, 30, 'exactly 30 minutes, no overtime')
})

test('AC3: UTC only — daylight-saving dates are no different', () => {
	// US DST ends 2026-11-01, EU 2026-10-25, AU starts 2026-10-04: all still 15:00 UTC.
	for (const date of ['2026-03-08', '2026-03-29', '2026-10-04', '2026-10-25', '2026-11-01']) {
		const t = examTimes(date)
		assert.equal(iso(t.opensAt), `${date}T15:00:00.000Z`)
		assert.equal(t.closesAt.getTime() - t.opensAt.getTime(), 30 * 60_000)
	}
})

test('month, year and leap-day boundaries publish at the right next midnight', () => {
	assert.equal(iso(examTimes('2026-12-31').publishAt), '2027-01-01T00:00:00.000Z')
	assert.equal(iso(examTimes('2028-02-28').publishAt), '2028-02-29T00:00:00.000Z')
	assert.equal(iso(examTimes('2028-02-29').publishAt), '2028-03-01T00:00:00.000Z')
})

test('a malformed or impossible date never produces an exam', () => {
	for (const bad of ['2026-13-01', '2026-02-30', '2026-2-3', 'x', '', '2026-11-20T00:00'])
		assert.throws(() => examTimes(bad), /invalid exam date/, bad)
})

test('AC8: phases change exactly at each boundary (half-open intervals)', () => {
	const t = examTimes('2026-11-20')
	const at = (s: string) => timePhase(t, new Date(`2026-11-20T${s}Z`))
	assert.equal(at('14:59:59.999'), 'before_open')
	assert.equal(at('15:00:00.000'), 'open_admitting')
	assert.equal(at('15:09:59.999'), 'open_admitting')
	assert.equal(at('15:10:00.000'), 'open_closed_to_entry')
	assert.equal(at('15:29:59.999'), 'open_closed_to_entry')
	assert.equal(at('15:30:00.000'), 'closed', 'no overtime: closed at exactly 15:30')
	assert.equal(at('23:59:59.999'), 'closed')
	assert.equal(timePhase(t, new Date('2026-11-21T00:00:00.000Z')), 'published_window')
})

test('AC18: elapsed and remaining seconds are whole, server-timed and never negative', () => {
	const t = examTimes('2026-11-20')
	assert.equal(elapsedSeconds(t, new Date('2026-11-20T15:12:34.999Z')), 754)
	assert.equal(elapsedSeconds(t, new Date('2026-11-20T14:00:00.000Z')), 0)
	assert.equal(elapsedSeconds(t, t.closesAt), 1800)
	assert.equal(remainingSeconds(t, new Date('2026-11-20T15:12:34.000Z')), 1046)
	assert.equal(remainingSeconds(t, new Date('2026-11-20T16:00:00.000Z')), 0)
})

test('examDateOf is the UTC calendar date', () => {
	assert.equal(examDateOf(new Date('2026-11-20T23:59:59.999Z')), '2026-11-20')
	assert.equal(examDateOf(new Date('2026-11-21T00:00:00.000Z')), '2026-11-21')
})
