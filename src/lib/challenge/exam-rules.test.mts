import test from 'node:test'
import assert from 'node:assert/strict'
import {
	EXAM_DURATION_MS,
	SUBMIT_GRACE_MS,
	acceptsSubmission,
	deadlineFor,
	elapsedFor,
	isScored,
	msRemaining,
	phaseOf
} from './exam-rules.ts'

const T0 = new Date('2026-11-10T10:00:00.000Z')

test('the exam is thirty minutes from the server-recorded start', () => {
	assert.equal(EXAM_DURATION_MS, 30 * 60 * 1000)
	assert.equal(deadlineFor(T0).toISOString(), '2026-11-10T10:30:00.000Z')
})

test('the deadline is computed from the start only: it has no input a browser can change', () => {
	// deadlineFor takes one argument (the server's start instant) and nothing else.
	assert.equal(deadlineFor.length, 1)
	assert.equal(acceptsSubmission.length, 2)
	assert.equal(msRemaining.length, 2)
})

test('a submission is accepted up to the deadline plus a small grace, and not a millisecond later', () => {
	const deadline = deadlineFor(T0)
	assert.equal(acceptsSubmission(deadline, new Date('2026-11-10T10:29:59.999Z')), true)
	assert.equal(acceptsSubmission(deadline, deadline), true)
	assert.equal(acceptsSubmission(deadline, new Date(deadline.getTime() + SUBMIT_GRACE_MS)), true)
	assert.equal(
		acceptsSubmission(deadline, new Date(deadline.getTime() + SUBMIT_GRACE_MS + 1)),
		false
	)
})

test('time remaining counts down to zero and never goes negative', () => {
	const deadline = deadlineFor(T0)
	assert.equal(msRemaining(deadline, T0), EXAM_DURATION_MS)
	assert.equal(msRemaining(deadline, new Date('2026-11-10T10:29:00.000Z')), 60_000)
	assert.equal(msRemaining(deadline, new Date('2026-11-10T11:00:00.000Z')), 0)
})

test('elapsed time is measured by the server, floored at zero and capped at the limit', () => {
	assert.equal(elapsedFor(T0, new Date('2026-11-10T10:12:34.000Z')), 12 * 60_000 + 34_000)
	assert.equal(elapsedFor(T0, new Date('2026-11-10T09:00:00.000Z')), 0)
	assert.equal(elapsedFor(T0, new Date('2026-11-10T10:30:03.000Z')), EXAM_DURATION_MS)
})

test('phases: running until the deadline, then expired if never submitted', () => {
	const row = (status: string) => ({ status, deadlineAt: deadlineFor(T0) })
	assert.equal(phaseOf(row('started'), new Date('2026-11-10T10:10:00Z')), 'running')
	assert.equal(phaseOf(row('started'), new Date('2026-11-10T10:30:04.999Z')), 'running') // inside grace
	assert.equal(phaseOf(row('started'), new Date('2026-11-10T10:30:05.001Z')), 'expired')
	assert.equal(phaseOf(row('expired'), T0), 'expired')
	assert.equal(phaseOf(row('submitted'), new Date('2030-01-01')), 'submitted')
	assert.equal(phaseOf(row('grading'), T0), 'grading')
	assert.equal(phaseOf(row('graded'), T0), 'graded')
	assert.equal(phaseOf(row('grader_error'), T0), 'grader_error')
	assert.equal(phaseOf(row('nonsense'), T0), 'expired')
})

test('only a graded attempt has a score', () => {
	for (const status of ['started', 'submitted', 'grading', 'grader_error', 'expired', 'x'])
		assert.equal(isScored(status), false, status)
	assert.equal(isScored('graded'), true)
})
