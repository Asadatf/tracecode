// The Daily Learning Challenge's rules (specs/features/daily-challenge.md). Pure and
// clock-free: callers pass the SERVER's instants. The 30 minutes is a SOFT TARGET: there is
// no deadline, no expiry and no submission cutoff, so overtime is unlimited.

// The soft target: thirty minutes from the server-recorded start.
export const EXAM_DURATION_MS = 30 * 60 * 1000
// Largest source accepted for a submission.
export const MAX_SOURCE_BYTES = 20_000

export const ATTEMPT_STATUSES = [
	'started',
	'submitted',
	'grading',
	'graded',
	'grader_error',
	'expired'
] as const
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]

export function deadlineFor(startedAt: Date): Date {
	return new Date(startedAt.getTime() + EXAM_DURATION_MS)
}

// Whole milliseconds from the server-recorded start to the final submit. Never negative
// and NOT capped: a long overtime is recorded as it was.
export function elapsedFor(startedAt: Date, submittedAt: Date): number {
	return Math.max(0, submittedAt.getTime() - startedAt.getTime())
}

// What the page should show for an attempt. There is no "expired": a started attempt is
// running (or in overtime) until its one final submit, whatever the clock says.
export type Phase = 'running' | 'submitted' | 'grading' | 'graded' | 'grader_error'

export function phaseOf(attempt: { status: string }): Phase {
	switch (attempt.status) {
		case 'submitted':
			return 'submitted'
		case 'grading':
			return 'grading'
		case 'graded':
			return 'graded'
		case 'grader_error':
			return 'grader_error'
		default:
			// 'started', and a legacy 'expired' row from the earlier exam design, are both
			// still open: nothing about time ever closes the challenge.
			return 'running'
	}
}
