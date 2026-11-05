import test from 'node:test'
import assert from 'node:assert/strict'
import * as rules from './exam-rules.ts'
import { EXAM_DURATION_MS, deadlineFor, elapsedFor, phaseOf } from './exam-rules.ts'

const T0 = new Date('2026-11-10T10:00:00.000Z')

test('the soft target is thirty minutes from the server-recorded start', () => {
	assert.equal(EXAM_DURATION_MS, 30 * 60 * 1000)
	assert.equal(deadlineFor(T0).toISOString(), '2026-11-10T10:30:00.000Z')
	// It has one input (the server's start instant) and nothing a browser can change.
	assert.equal(deadlineFor.length, 1)
})

test('there is no deadline machinery: nothing can refuse, expire or cap a submission', () => {
	for (const gone of ['acceptsSubmission', 'SUBMIT_GRACE_MS', 'msRemaining', 'isScored'])
		assert.equal(gone in rules, false, gone)
})

test('elapsed time is server measured, floored at zero and NOT capped, so overtime is recorded', () => {
	assert.equal(elapsedFor(T0, new Date('2026-11-10T10:12:34.000Z')), 12 * 60_000 + 34_000)
	assert.equal(elapsedFor(T0, new Date('2026-11-10T09:00:00.000Z')), 0)
	assert.equal(elapsedFor(T0, new Date('2026-11-10T10:30:03.000Z')), EXAM_DURATION_MS + 3_000)
	assert.equal(elapsedFor(T0, new Date('2026-11-10T14:00:00.000Z')), 4 * 3600_000)
	// Across UTC midnight.
	assert.equal(
		elapsedFor(new Date('2026-11-10T23:50:00Z'), new Date('2026-11-11T01:20:00Z')),
		90 * 60_000
	)
})

test('phases: open until the one final submission, whatever the time, then submitted / grading / graded', () => {
	assert.equal(phaseOf({ status: 'started' }), 'running')
	assert.equal(phaseOf({ status: 'submitted' }), 'submitted')
	assert.equal(phaseOf({ status: 'grading' }), 'grading')
	assert.equal(phaseOf({ status: 'graded' }), 'graded')
	assert.equal(phaseOf({ status: 'grader_error' }), 'grader_error')
	// Nothing about time closes a challenge; a leftover 'expired' row from the earlier
	// exam design is open again, and so is anything unknown (it can still be submitted once).
	assert.equal(phaseOf({ status: 'expired' }), 'running')
	assert.equal(phaseOf({ status: 'nonsense' }), 'running')
	// phaseOf takes no clock at all.
	assert.equal(phaseOf.length, 1)
})
