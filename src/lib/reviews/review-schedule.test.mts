import test from 'node:test'
import assert from 'node:assert/strict'
import {
	REVIEW_STAGES,
	advance,
	dueLabel,
	enrol,
	isComplete,
	isDue,
	pendingStage,
	planReviewAction
} from './review-schedule.ts'

test('a first solve starts the cycle: review 1 is due the next UTC day', () => {
	assert.deepEqual(enrol('2026-11-10'), { reviewsDone: 0, dueDay: '2026-11-11' })
	// Month, year and leap-day boundaries are ordinary days.
	assert.equal(enrol('2026-11-30').dueDay, '2026-12-01')
	assert.equal(enrol('2026-12-31').dueDay, '2027-01-01')
	assert.equal(enrol('2024-02-28').dueDay, '2024-02-29')
	assert.equal(enrol('2024-02-29').dueDay, '2024-03-01')
})

test('intervals are 1, then 3, then 7 days from each SUCCESSFUL review', () => {
	let state = enrol('2026-11-10') // due 11-11
	const r1 = advance(state, '2026-11-11')
	assert.ok(r1.advanced)
	assert.deepEqual(r1.state, { reviewsDone: 1, dueDay: '2026-11-14' }) // +3
	const r2 = advance(r1.state, '2026-11-14')
	assert.ok(r2.advanced)
	assert.deepEqual(r2.state, { reviewsDone: 2, dueDay: '2026-11-21' }) // +7
	const r3 = advance(r2.state, '2026-11-21')
	assert.ok(r3.advanced && r3.completed)
	assert.equal(r3.state.reviewsDone, REVIEW_STAGES)
	assert.equal(isComplete(r3.state), true)
	assert.equal(pendingStage(r3.state), null)
	state = r3.state
	assert.deepEqual(advance(state, '2026-12-31'), { advanced: false, reason: 'complete' })
})

test('a late review counts from the day it was actually completed', () => {
	const late = advance(enrol('2026-11-01'), '2026-11-20') // due 11-02, done 11-20
	assert.ok(late.advanced)
	assert.equal(late.state.dueDay, '2026-11-23') // 11-20 + 3, not already overdue
})

test('a pass before the due day does not advance anything (no skipping ahead)', () => {
	const state = enrol('2026-11-10') // due 11-11
	assert.deepEqual(advance(state, '2026-11-10'), { advanced: false, reason: 'not_due' })
	assert.deepEqual(advance(state, '2026-11-10'), { advanced: false, reason: 'not_due' })
	const r1 = advance(state, '2026-11-11')
	assert.ok(r1.advanced)
	// And a same-day second pass cannot take the next stage: it is not due yet.
	assert.deepEqual(advance(r1.state, '2026-11-11'), { advanced: false, reason: 'not_due' })
})

test('UTC boundary: the due day starts at 00:00:00Z and the day before ends at 23:59:59Z', () => {
	const state = enrol('2026-11-10') // due 2026-11-11
	assert.equal(planReviewAction(state, new Date('2026-11-10T23:59:59.999Z')).action, 'none')
	assert.equal(planReviewAction(state, new Date('2026-11-11T00:00:00.000Z')).action, 'advance')
	// 23:30 in UTC-5 on the 10th is already the 11th in UTC.
	assert.equal(planReviewAction(state, new Date('2026-11-10T23:30:00-05:00')).action, 'advance')
	// 00:30 in UTC+2 on the 11th is still the 10th in UTC.
	assert.equal(planReviewAction(state, new Date('2026-11-11T00:30:00+02:00')).action, 'none')
})

test('with no row, a qualifying pass enrols; a repeat pass the same day is unchanged', () => {
	const plan = planReviewAction(null, new Date('2026-11-10T12:00:00Z'))
	assert.deepEqual(plan, { action: 'enrol', state: { reviewsDone: 0, dueDay: '2026-11-11' } })
})

test('due status: today, overdue by whole days, or upcoming', () => {
	const state = enrol('2026-11-10') // due 11-11
	assert.equal(isDue(state, '2026-11-10'), false)
	assert.equal(isDue(state, '2026-11-11'), true)
	assert.deepEqual(dueLabel(state, '2026-11-11'), { kind: 'today' })
	assert.deepEqual(dueLabel(state, '2026-11-14'), { kind: 'overdue', days: 3 })
	assert.deepEqual(dueLabel(state, '2026-11-09'), { kind: 'upcoming', days: 2 })
	assert.equal(pendingStage(state), 1)
	assert.equal(isDue({ reviewsDone: 3, dueDay: '2026-01-01' }, '2026-12-01'), false)
})
