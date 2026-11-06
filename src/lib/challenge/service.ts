import { MAX_SOURCE_BYTES, deadlineFor, elapsedFor, phaseOf, type Phase } from './exam-rules'
import { weekStartOf } from './week'

// The Daily Learning Challenge's attempt lifecycle as orchestration over an injected
// store, so the rules that matter — one attempt per learner per challenge, a server-owned
// start, exactly ONE final submission (valid at any time: the 30 minutes is a soft target,
// never a cutoff), no double grading, no result without a verified grader — are tested
// against a fake that behaves like the database. No score or ranking exists; the result
// is test counts. The Prisma wiring is src/server/challenge/store.ts.
//
// Every mutation is a single CONDITIONAL write on the state the caller expects, never
// a read-then-write, so duplicate and concurrent requests cannot both succeed.

export interface AttemptRow {
	id: string
	userId: string
	challengeDate: string
	status: string
	startedAt: Date
	deadlineAt: Date
	submittedAt: Date | null
	elapsedMs: number | null
	testsPassed: number | null
	testsTotal: number | null
	gradeError: string | null
	gradingClaimedAt: Date | null
}

export interface GradeRecord {
	testsPassed: number
	testsTotal: number
	graderVersion: string
}

export interface ChallengeAttemptStore {
	find(userId: string, date: string): Promise<AttemptRow | null>
	// Insert if absent (the (user, date) unique key decides); true when this call created it.
	create(input: {
		userId: string
		date: string
		startedAt: Date
		deadlineAt: Date
		weekStart: string
	}): Promise<boolean>
	// started -> submitted, once, at any time (there is no deadline).
	submit(input: {
		userId: string
		date: string
		source: string
		submittedAt: Date
		elapsedMs: number
	}): Promise<boolean>
	// submitted | grader_error | (grading, claimed before `staleBefore`) -> grading.
	claimGrading(userId: string, date: string, now: Date, staleBefore: Date): Promise<boolean>
	// grading -> graded with the verified counts. When the submission passed every test it
	// also records the verified solve (Attempt, progress) in the same transaction, dated at
	// the SUBMISSION, and starts the spaced-review cycle, exactly once.
	completeGrading(userId: string, date: string, record: GradeRecord, at: Date): Promise<boolean>
	// grading -> grader_error with a short code.
	failGrading(userId: string, date: string, code: string): Promise<boolean>
	readSource(userId: string, date: string): Promise<string | null>
}

// What the browser may see: state, times and, only once graded, the verified counts.
// Never the source, never per-test detail, never a score.
export interface AttemptView {
	phase: Phase
	startedAt: string
	// When the one final submission was made, or null while the challenge is open.
	submittedAt: string | null
	elapsedMs: number | null
	testsPassed: number | null
	testsTotal: number | null
}

export function toAttemptView(row: AttemptRow): AttemptView {
	const graded = row.status === 'graded'
	return {
		phase: phaseOf(row),
		startedAt: row.startedAt.toISOString(),
		submittedAt: row.submittedAt == null ? null : row.submittedAt.toISOString(),
		elapsedMs: row.elapsedMs,
		testsPassed: graded ? row.testsPassed : null,
		testsTotal: graded ? row.testsTotal : null
	}
}

export type StartOutcome =
	{ ok: true; created: boolean; attempt: AttemptRow } | { ok: false; error: 'unavailable' }

// Starting is idempotent: a second request (a refresh, a double click, another tab)
// returns the SAME attempt with the SAME deadline, never a fresh clock.
export async function startAttempt(
	store: ChallengeAttemptStore,
	userId: string,
	date: string,
	now: Date
): Promise<StartOutcome> {
	const created = await store.create({
		userId,
		date,
		startedAt: now,
		deadlineAt: deadlineFor(now),
		weekStart: weekStartOf(date)
	})
	const attempt = await store.find(userId, date)
	return attempt == null ? { ok: false, error: 'unavailable' } : { ok: true, created, attempt }
}

export type SubmitOutcome =
	| { ok: true; accepted: true; attempt: AttemptRow }
	| { ok: true; accepted: false; reason: 'already_submitted'; attempt: AttemptRow }
	| { ok: false; error: 'not_started' | 'empty' | 'too_large' | 'unavailable' }

export async function submitAttempt(
	store: ChallengeAttemptStore,
	userId: string,
	date: string,
	source: string,
	now: Date
): Promise<SubmitOutcome> {
	if (source.trim() === '') return { ok: false, error: 'empty' }
	if (new TextEncoder().encode(source).length > MAX_SOURCE_BYTES)
		return { ok: false, error: 'too_large' }

	const current = await store.find(userId, date)
	if (current == null) return { ok: false, error: 'not_started' }
	// A repeat of the one final submission just reports it. Nothing about the clock matters.
	if (current.status !== 'started' && current.status !== 'expired') {
		return { ok: true, accepted: false, reason: 'already_submitted', attempt: current }
	}

	const won = await store.submit({
		userId,
		date,
		source,
		submittedAt: now,
		elapsedMs: elapsedFor(current.startedAt, now)
	})
	const after = await store.find(userId, date)
	if (after == null) return { ok: false, error: 'unavailable' }
	// Losing the race means a duplicate or simultaneous request already submitted: the first
	// source wins and this one changes nothing.
	return won
		? { ok: true, accepted: true, attempt: after }
		: { ok: true, accepted: false, reason: 'already_submitted', attempt: after }
}

// ---- Grading ------------------------------------------------------------------------

export type GradeOutcome =
	| { ok: true; testsPassed: number; testsTotal: number; graderVersion: string }
	| { ok: false; code: string }

// The server-side grader. It receives the learner's source and the challenge's problem
// and returns counts it produced itself; it can only ever be implemented by code that
// executes the source in isolation and judges against hidden answers.
export interface Grader {
	grade(job: { problemSlug: string; source: string }): Promise<GradeOutcome>
}

// A grading claim older than this is a crashed worker and may be taken over. It must outlast
// one whole grading run (sandbox creation plus a sandbox that lives up to SANDBOX_TIMEOUT_MS)
// AND the longest a Vercel function can live (300s on Fluid compute), so a claim is only taken
// over once its worker cannot still be running; otherwise a slow but healthy run could be
// overlapped by a second one whose failure cancels its result.
export const GRADING_CLAIM_TTL_MS = 6 * 60 * 1000
export const MAX_FUNCTION_DURATION_MS = 300 * 1000

// Bounded retries. A failed grading is retried with a growing delay, and the request-driven
// triggers (the submit and the status poll) give up after MAX_GRADING_TRIES, so an outage or a
// submission that always breaks the runner cannot create sandboxes (a quota) on every poll. The
// daily cron ('scheduled') still gives such a submission one try per run, so it stays pending,
// never failed, and a restored grader grades it with no new submission. The count rides on
// gradeError as `code#n`, which needs no schema change.
export const MAX_GRADING_TRIES = 3
export const GRADING_RETRY_BACKOFF_MS = 60 * 1000

export function triesOf(gradeError: string | null): number {
	const match = /#(\d+)$/.exec(gradeError ?? '')
	return match == null ? 0 : Number(match[1])
}

export type GradingResult =
	| { status: 'graded' }
	| { status: 'grader_error'; code: string }
	| { status: 'retry_later' }
	| { status: 'gave_up' }
	| { status: 'not_claimed' }
	| { status: 'no_grader' }

export async function gradeAttempt(
	store: ChallengeAttemptStore,
	grader: Grader | null,
	userId: string,
	date: string,
	problemSlug: string,
	now: Date,
	// The instant grading FINISHED, for `gradedAt` (defaults to `now`; the server passes its clock).
	finishedAt: () => Date = () => now,
	// 'bounded' for request-driven triggers; 'scheduled' (the daily cron) ignores the try limit.
	mode: 'bounded' | 'scheduled' = 'bounded'
): Promise<GradingResult> {
	// No grader configured: the submission waits. It is never scored from anything else.
	if (grader == null) return { status: 'no_grader' }

	const before = await store.find(userId, date)
	if (before?.status === 'grader_error') {
		const tries = triesOf(before.gradeError)
		if (tries >= MAX_GRADING_TRIES && mode === 'bounded') return { status: 'gave_up' }
		const last = before.gradingClaimedAt?.getTime() ?? 0
		if (now.getTime() < last + GRADING_RETRY_BACKOFF_MS * Math.max(tries, 1))
			return { status: 'retry_later' }
	}

	const claimed = await store.claimGrading(
		userId,
		date,
		now,
		new Date(now.getTime() - GRADING_CLAIM_TTL_MS)
	)
	if (!claimed) return { status: 'not_claimed' }

	const row = await store.find(userId, date)
	const source = await store.readSource(userId, date)
	const tries = triesOf(row?.gradeError ?? null)
	const fail = async (code: string): Promise<GradingResult> => {
		await store.failGrading(userId, date, `${code}#${tries + 1}`)
		return { status: 'grader_error', code }
	}
	if (row == null || source == null || row.elapsedMs == null) return fail('missing_submission')

	let outcome: GradeOutcome
	try {
		outcome = await grader.grade({ problemSlug, source })
	} catch {
		outcome = { ok: false, code: 'grader_exception' }
	}
	if (!outcome.ok) return fail(outcome.code)
	const wrote = await store.completeGrading(
		userId,
		date,
		{
			testsPassed: outcome.testsPassed,
			testsTotal: outcome.testsTotal,
			graderVersion: outcome.graderVersion
		},
		finishedAt()
	)
	return wrote ? { status: 'graded' } : { status: 'not_claimed' }
}
