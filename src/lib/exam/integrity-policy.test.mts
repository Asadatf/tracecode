import test from 'node:test'
import assert from 'node:assert/strict'
import {
	POLICY_V1,
	POLICY_VERSION,
	applyPolicyV1,
	type IntegrityEventType,
	type PolicyEvent
} from './integrity-policy.ts'

// specs/features/daily-exam.md AC25 — integrity-policy@1.

const OPEN = Date.parse('2026-11-20T15:00:00.000Z')
const admittedAt = new Date(OPEN)
const closesAt = new Date(OPEN + 30 * 60_000)
const at = (sec: number) => new Date(OPEN + sec * 1000)
const ev = (type: IntegrityEventType, sec: number, screenCount?: number): PolicyEvent => ({
	type,
	receivedAt: at(sec),
	...(screenCount == null ? {} : { screenCount })
})
const run = (events: PolicyEvent[]) => applyPolicyV1({ events, admittedAt, closesAt })

test('a clean attempt has no warnings, deductions or flags', () => {
	const r = run([])
	assert.equal(r.policyVersion, POLICY_VERSION)
	assert.equal(r.totalDeduction, 0)
	assert.deepEqual(r.warnings, [])
	assert.deepEqual(r.flags, [])
})

test('tab: one hide is only a warning, however long', () => {
	const r = run([ev('tab_hidden', 60), ev('tab_visible', 400)])
	assert.deepEqual(r.warnings, ['tab_hidden'])
	assert.equal(r.totalDeduction, 0)
	assert.equal(r.summary.tabHiddenSeconds, 340)
})

test('tab: later hides cost only once cumulative time is past the 30 s grace', () => {
	// Three short hides of 5 s: total 15 s, inside the grace: no deduction.
	const short = run([
		ev('tab_hidden', 10),
		ev('tab_visible', 15),
		ev('tab_hidden', 20),
		ev('tab_visible', 25),
		ev('tab_hidden', 30),
		ev('tab_visible', 35)
	])
	assert.equal(short.totalDeduction, 0)
	// Then a 20 s hide crosses the grace: one unit.
	const crossing = run([
		ev('tab_hidden', 10),
		ev('tab_visible', 15),
		ev('tab_hidden', 20),
		ev('tab_visible', 25),
		ev('tab_hidden', 30),
		ev('tab_visible', 35),
		ev('tab_hidden', 40),
		ev('tab_visible', 60)
	])
	assert.deepEqual(crossing.deductions, [
		{ rule: 'tab_hidden', units: 1, points: POLICY_V1.tabDeduction }
	])
})

test('tab: deductions are capped at 1000', () => {
	const events: PolicyEvent[] = []
	for (let i = 0; i < 20; i += 1)
		events.push(ev('tab_hidden', 10 + i * 60), ev('tab_visible', 50 + i * 60))
	const r = run(events)
	assert.equal(r.deductions[0]?.points, POLICY_V1.tabCap)
})

test('tab: a hide still open at closing runs to the deadline, not beyond', () => {
	const r = run([ev('tab_hidden', 1790)])
	assert.equal(r.summary.tabHiddenSeconds, 10)
})

test('paste/drag: two warnings, then 100 each, capped at 600', () => {
	const two = run([ev('paste_blocked', 1), ev('drag_insert_blocked', 2)])
	assert.equal(two.totalDeduction, 0)
	assert.deepEqual(two.warnings, ['blocked_insertion'])
	const five = run([1, 2, 3, 4, 5].map((s) => ev('paste_blocked', s)))
	assert.deepEqual(five.deductions, [{ rule: 'blocked_insertion', units: 3, points: 300 }])
	const many = run(Array.from({ length: 30 }, (_, i) => ev('paste_blocked', i + 1)))
	assert.equal(many.deductions[0]?.points, POLICY_V1.pasteCap)
})

test('fullscreen: one short exit is a warning; more exits or time outside cost, capped', () => {
	const one = run([ev('fullscreen_exited', 100), ev('fullscreen_entered', 110)])
	assert.equal(one.totalDeduction, 0)
	// A second exit: one unit.
	const two = run([
		ev('fullscreen_exited', 100),
		ev('fullscreen_entered', 105),
		ev('fullscreen_exited', 200),
		ev('fullscreen_entered', 205)
	])
	assert.deepEqual(two.deductions, [{ rule: 'fullscreen_exit', units: 1, points: 150 }])
	// One exit of 45 s: (45 − 15) / 15 = 2 units.
	const long = run([ev('fullscreen_exited', 100), ev('fullscreen_entered', 145)])
	assert.deepEqual(long.deductions, [{ rule: 'fullscreen_exit', units: 2, points: 300 }])
	const huge = run([ev('fullscreen_exited', 10)])
	assert.equal(huge.deductions[0]?.points, POLICY_V1.fullscreenCap)
})

test('the total automatic deduction is capped at 2000 of 10,000', () => {
	const events: PolicyEvent[] = [ev('fullscreen_exited', 5)]
	for (let i = 0; i < 20; i += 1)
		events.push(ev('tab_hidden', 10 + i * 60), ev('tab_visible', 50 + i * 60))
	for (let i = 0; i < 30; i += 1) events.push(ev('paste_blocked', 20 + i))
	const r = run(events)
	assert.equal(
		r.deductions.reduce((a, d) => a + d.points, 0),
		2200
	)
	assert.equal(r.totalDeduction, POLICY_V1.totalCap)
})

test('weak or unsupported signals are review flags and NEVER deduct', () => {
	const r = run([
		...Array.from({ length: 50 }, (_, i) => ev('window_blurred', i + 1)),
		...Array.from({ length: 10 }, (_, i) => ev('screenshot_shortcut_observed', i + 100)),
		ev('screens_reported', 200, 3),
		ev('camera_interrupted', 300),
		ev('microphone_interrupted', 301),
		ev('screen_capture_interrupted', 302),
		ev('network_offline', 400),
		ev('delivery_gap', 500),
		ev('rate_limited', 501)
	])
	assert.equal(r.totalDeduction, 0)
	assert.deepEqual(r.deductions, [])
	assert.deepEqual(r.flags.map((f) => f.kind).sort(), [
		'camera_interruption',
		'microphone_interruption',
		'multiple_screens',
		'network_interruption',
		'reporting_gap',
		'screen_capture_interruption',
		'screenshot_shortcut',
		'window_blur'
	])
})

test('an unsupported or denied screen check is a flag, never a guessed count', () => {
	const unsupported = run([ev('screens_unsupported', 1)])
	assert.equal(unsupported.summary.screenCheck, 'unsupported')
	assert.equal(unsupported.summary.maxScreensReported, null)
	assert.equal(unsupported.totalDeduction, 0)
	const one = run([ev('screens_reported', 1, 1)])
	assert.equal(one.summary.maxScreensReported, 1)
	assert.equal(one.flags.length, 0)
})

test('events outside [admittedAt, closesAt) do not count', () => {
	const r = run([
		ev('tab_hidden', -100),
		ev('tab_visible', -50),
		ev('paste_blocked', 1801),
		ev('paste_blocked', 1802),
		ev('paste_blocked', 1803)
	])
	assert.equal(r.summary.tabHides, 0)
	assert.equal(r.summary.blockedInsertions, 0)
})

test('the result is deterministic regardless of event arrival order', () => {
	const events = [
		ev('tab_hidden', 10),
		ev('tab_visible', 20),
		ev('tab_hidden', 30),
		ev('tab_visible', 90),
		ev('paste_blocked', 5),
		ev('paste_blocked', 6),
		ev('paste_blocked', 7)
	]
	assert.deepEqual(run(events), run([...events].reverse()))
})
