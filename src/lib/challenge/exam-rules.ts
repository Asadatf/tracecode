// The timed-assessment rules (specs/features/daily-challenge.md). Pure and clock-free:
// every function takes the instant it should judge, and callers pass the SERVER's
// clock. A browser's clock is never consulted, so changing it cannot extend an exam.

// Thirty minutes from the server-recorded start.
export const EXAM_DURATION_MS = 30 * 60 * 1000
// Network and server latency allowance for the auto-submit at zero. Small on purpose.
export const SUBMIT_GRACE_MS = 5_000
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

export function msRemaining(deadlineAt: Date, now: Date): number {
	return Math.max(0, deadlineAt.getTime() - now.getTime())
}

// Whether a submission arriving at `now` may still count. The grace covers the
// client's auto-submit at zero; anything later is late and earns nothing.
export function acceptsSubmission(deadlineAt: Date, now: Date): boolean {
	return now.getTime() <= deadlineAt.getTime() + SUBMIT_GRACE_MS
}

// Elapsed time to record: server-measured, never negative, never above the limit.
export function elapsedFor(startedAt: Date, submittedAt: Date): number {
	return Math.min(EXAM_DURATION_MS, Math.max(0, submittedAt.getTime() - startedAt.getTime()))
}

// What the page should show for an attempt, judged at `now` — including an attempt
// whose time ran out without a submission, which is expired even if no one has
// marked it yet.
export type Phase = 'running' | 'expired' | 'submitted' | 'grading' | 'graded' | 'grader_error'

export function phaseOf(attempt: { status: string; deadlineAt: Date }, now: Date): Phase {
	switch (attempt.status) {
		case 'started':
			return acceptsSubmission(attempt.deadlineAt, now) ? 'running' : 'expired'
		case 'submitted':
			return 'submitted'
		case 'grading':
			return 'grading'
		case 'graded':
			return 'graded'
		case 'grader_error':
			return 'grader_error'
		default:
			return 'expired'
	}
}

// Only a fully graded attempt has a score; every other state has none, whatever
// a row might contain.
export function isScored(status: string): boolean {
	return status === 'graded'
}
