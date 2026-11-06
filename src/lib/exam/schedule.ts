// The fixed Daily Exam schedule (specs/features/daily-exam.md AC1, ADR-0011). Typed, versioned
// configuration in code, deliberately NOT an admin setting or a flag payload: every exam uses the
// same UTC times, so there is nothing to configure day to day. Changing it is a reviewed code
// change that bumps SCHEDULE_VERSION; each exam stores the version it was created with, so a change
// never moves an exam that already exists.
//
// Pure and clock-free: callers pass the database server's instant (AC3). These functions only
// compute the boundaries; every eligibility DECISION is made by the database comparing its own
// now() with the stored timestamps inside the conditional write.

export const SCHEDULE_VERSION = 'schedule@1'

export const EXAM_SCHEDULE = {
	// 15:00 UTC.
	opensAtMinuteUtc: 15 * 60,
	// Exactly 30 minutes; no overtime. Closes 15:30 UTC.
	durationMin: 30,
	// Start is refused 10 minutes after opening; it never extends the deadline.
	lateEntryMin: 10,
	// Results and evaluations targeted 60 minutes after closing: 16:30 UTC (a target, measured).
	resultsTargetMin: 60,
	// Event metadata kept 90 days after publication (longer than the 30-day appeal window).
	retentionDays: 90,
	integrityPolicyVersion: 'integrity-policy@1'
} as const

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

export interface ExamTimes {
	opensAt: Date
	closesAt: Date
	lateEntryUntil: Date
	resultsDueAt: Date
	// The following UTC midnight: the earliest moment the problem may become public (AC30).
	publishAt: Date
	retentionUntil: Date
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// The boundaries of the exam on `examDate` ('YYYY-MM-DD', a UTC calendar date). Throws on a
// malformed or non-existent date, so a bad route parameter can never produce an exam.
export function examTimes(examDate: string): ExamTimes {
	if (!DATE_RE.test(examDate)) throw new Error('invalid exam date')
	const midnight = Date.parse(`${examDate}T00:00:00.000Z`)
	if (Number.isNaN(midnight) || new Date(midnight).toISOString().slice(0, 10) !== examDate)
		throw new Error('invalid exam date')
	const opensAt = midnight + EXAM_SCHEDULE.opensAtMinuteUtc * MINUTE_MS
	const closesAt = opensAt + EXAM_SCHEDULE.durationMin * MINUTE_MS
	const publishAt = midnight + DAY_MS
	return {
		opensAt: new Date(opensAt),
		closesAt: new Date(closesAt),
		lateEntryUntil: new Date(opensAt + EXAM_SCHEDULE.lateEntryMin * MINUTE_MS),
		resultsDueAt: new Date(closesAt + EXAM_SCHEDULE.resultsTargetMin * MINUTE_MS),
		publishAt: new Date(publishAt),
		retentionUntil: new Date(publishAt + EXAM_SCHEDULE.retentionDays * DAY_MS)
	}
}

// The UTC calendar date of an instant.
export function examDateOf(instant: Date): string {
	return instant.toISOString().slice(0, 10)
}

// Where an exam stands at `now` purely by time (never by stored status). Used for display and
// for deciding which jobs to create; the database repeats each comparison when it writes.
export type TimePhase =
	| 'before_open'
	// Open and still admitting new participants.
	| 'open_admitting'
	// Open, late entry over: only already-admitted participants may continue.
	| 'open_closed_to_entry'
	| 'closed'
	| 'published_window'

export function timePhase(times: ExamTimes, now: Date): TimePhase {
	const t = now.getTime()
	if (t < times.opensAt.getTime()) return 'before_open'
	if (t < times.lateEntryUntil.getTime()) return 'open_admitting'
	if (t < times.closesAt.getTime()) return 'open_closed_to_entry'
	if (t < times.publishAt.getTime()) return 'closed'
	return 'published_window'
}

// Whole seconds from opening to an instant, never negative (AC18).
export function elapsedSeconds(times: ExamTimes, submittedAt: Date): number {
	return Math.max(0, Math.floor((submittedAt.getTime() - times.opensAt.getTime()) / 1000))
}

// Whole seconds left at an instant, never negative (AC28 evidence: time remaining at submission).
export function remainingSeconds(times: ExamTimes, at: Date): number {
	return Math.max(0, Math.floor((times.closesAt.getTime() - at.getTime()) / 1000))
}
