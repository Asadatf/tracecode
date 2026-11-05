import test from 'node:test'
import assert from 'node:assert/strict'
import { DAILY_TARGET_MS, dailyClock, formatClock, type DailyState } from './daily.ts'

const START = Date.parse('2026-11-10T10:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const running: DailyState = { startedAt: iso(START), submittedAt: null }

test('before Start there is no clock: the full target, nothing elapsed', () => {
	const clock = dailyClock({ startedAt: null, submittedAt: null }, START + 5_000)
	assert.deepEqual(clock, {
		phase: 'not_started',
		remainingMs: DAILY_TARGET_MS,
		overtimeMs: 0,
		elapsedMs: 0
	})
})

test('the target is 30 minutes from the server-recorded start', () => {
	assert.equal(DAILY_TARGET_MS, 30 * 60_000)
	const clock = dailyClock(running, START + 12 * 60_000)
	assert.equal(clock.phase, 'running')
	assert.equal(clock.remainingMs, 18 * 60_000)
	assert.equal(clock.overtimeMs, 0)
})

test('a refresh changes nothing: the same start and the same "now" give the same clock', () => {
	const at = START + 7 * 60_000 + 123
	assert.deepEqual(dailyClock(running, at), dailyClock({ ...running }, at))
})

test('at exactly 00:00 it is still the target; one second later it is Overtime with elapsed overtime', () => {
	assert.equal(dailyClock(running, START + DAILY_TARGET_MS).phase, 'running')
	const over = dailyClock(running, START + DAILY_TARGET_MS + 1_001)
	assert.equal(over.phase, 'overtime')
	assert.equal(over.remainingMs, 0)
	assert.equal(over.overtimeMs, 1_001)
	assert.equal(dailyClock(running, START + DAILY_TARGET_MS + 95 * 60_000).overtimeMs, 95 * 60_000)
})

test('overtime has no limit: hours past the target it is still open', () => {
	assert.equal(dailyClock(running, START + 30 * 3600_000).phase, 'overtime')
})

test('the timer stops at the ONE final submit and stays stopped, however late it is now', () => {
	const done: DailyState = { startedAt: iso(START), submittedAt: iso(START + 14 * 60_000 + 8_000) }
	for (const later of [0, 60_000, 3 * 3600_000, 40 * 3600_000]) {
		const clock = dailyClock(done, START + 14 * 60_000 + 8_000 + later)
		assert.equal(clock.phase, 'submitted')
		assert.equal(clock.elapsedMs, 14 * 60_000 + 8_000)
		assert.equal(clock.overtimeMs, 0)
	}
})

test('submitting in overtime keeps the overtime and still stops', () => {
	const done: DailyState = { startedAt: iso(START), submittedAt: iso(START + 41 * 60_000) }
	const clock = dailyClock(done, START + 5 * 3600_000)
	assert.equal(clock.phase, 'submitted')
	assert.equal(clock.elapsedMs, 41 * 60_000)
	assert.equal(clock.overtimeMs, 11 * 60_000)
})

test('it survives UTC midnight: an attempt started at 23:50 is judged only by its own start', () => {
	const late = Date.parse('2026-11-10T23:50:00.000Z')
	const state: DailyState = { startedAt: iso(late), submittedAt: null }
	const clock = dailyClock(state, Date.parse('2026-11-11T00:05:00.000Z'))
	assert.equal(clock.phase, 'running')
	assert.equal(clock.elapsedMs, 15 * 60_000)
	assert.equal(dailyClock(state, Date.parse('2026-11-11T00:25:00.000Z')).phase, 'overtime')
	// A submit after midnight is valid and its time is the real elapsed time.
	const submitted = dailyClock(
		{ ...state, submittedAt: iso(Date.parse('2026-11-11T00:40:00.000Z')) },
		Date.parse('2026-11-12T00:00:00.000Z')
	)
	assert.equal(submitted.elapsedMs, 50 * 60_000)
})

test('a clock that is behind the start (skew) never goes negative', () => {
	const clock = dailyClock(running, START - 10_000)
	assert.equal(clock.elapsedMs, 0)
	assert.equal(clock.remainingMs, DAILY_TARGET_MS)
})

test('formatClock is MM:SS, and H:MM:SS from an hour', () => {
	assert.equal(formatClock(0), '00:00')
	assert.equal(formatClock(61_999), '01:01')
	assert.equal(formatClock(30 * 60_000), '30:00')
	assert.equal(formatClock(3600_000 + 5_000), '1:00:05')
	assert.equal(formatClock(-5), '00:00')
})
