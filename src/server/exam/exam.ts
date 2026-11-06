import 'server-only'
import { db } from '@/server/db/client'
import { getFlag } from '@/lib/flags/server'
import { dayColumn } from '@/lib/reviews/review-queries'
import { captureError } from '@/lib/observability/capture-error'
import { EXAM_SCHEDULE, SCHEDULE_VERSION, examDateOf, examTimes } from '@/lib/exam/schedule'
import { enqueueJobs, type NewJob } from '@/lib/exam/queue'
import { openExam } from '@/lib/exam/selection'
import { EVENT_TYPES, type IntegrityEventType } from '@/lib/exam/integrity-policy'
import { MAX_SOURCE_BYTES } from '@/lib/challenge/exam-rules'
import { jobStore, openStore } from './stores'

// The Daily Exam's server side (specs/features/daily-exam.md). Every function is keyed by the
// learner the session resolved — never by request input — and every eligibility decision is made
// by the DATABASE clock inside the conditional write (AC3). The exam is off unless `daily_exam`
// resolves on for this learner (a per-user override enables test accounts only).

const day = (d: Date) => d.toISOString().slice(0, 10)
export const INTEGRITY_SCORE_DELAY_MS = 90_000
export const LATE_EVENT_WINDOW_SECONDS = 60
export const MAX_EVENTS_PER_BATCH = 50
export const MAX_EVENTS_PER_MINUTE = 120

export async function examEnabled(userId?: string | null): Promise<boolean> {
	try {
		return (await getFlag('daily_exam', userId == null ? {} : { userId })) === true
	} catch {
		return false
	}
}

export interface ExamTimesInput {
	opensAt: Date
	closesAt: Date
	lateEntryUntil: Date
	resultsDueAt: Date
	publishAt: Date
	retentionUntil: Date
}

// Create the exam row and its time-driven jobs in ONE transaction (the outbox), idempotently. A
// test exam passes its own (short) times and a `test` schedule version; real dates use the fixed
// schedule.
export async function ensureExam(
	examDate: string,
	times: ExamTimesInput = examTimes(examDate),
	scheduleVersion: string = SCHEDULE_VERSION
): Promise<void> {
	const retentionDays = Math.round(
		(times.retentionUntil.getTime() - times.publishAt.getTime()) / 86_400_000
	)
	await db.$transaction(async (tx) => {
		const { count } = await tx.dailyExam.createMany({
			data: [
				{
					examDate: dayColumn(examDate),
					status: 'scheduled',
					opensAt: times.opensAt,
					closesAt: times.closesAt,
					lateEntryUntil: times.lateEntryUntil,
					resultsDueAt: times.resultsDueAt,
					publishAt: times.publishAt,
					retentionDays,
					scheduleVersion,
					policyVersion: EXAM_SCHEDULE.integrityPolicyVersion
				}
			],
			skipDuplicates: true
		})
		if (count === 0) return
		const at = times.closesAt
		const jobs: NewJob[] = [
			{ type: 'EXAM_CLOSEOUT', examDate, runAfter: at },
			{ type: 'EXAM_RESULT_FINALIZATION', examDate, runAfter: at },
			{ type: 'EXAM_LEADERBOARD_FINALIZATION', examDate, runAfter: at },
			{ type: 'EXAM_NOTIFICATIONS', examDate, runAfter: at },
			{ type: 'EXAM_PROBLEM_PUBLICATION', examDate, runAfter: at },
			{ type: 'EXAM_RETENTION_CLEANUP', examDate, runAfter: times.retentionUntil }
		]
		await enqueueJobs({ ...jobStore, enqueue: (rows) => createJobsIn(tx, rows) }, jobs)
	})
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
async function createJobsIn(
	tx: Tx,
	rows: readonly (NewJob & { idempotencyKey: string; maxAttempts: number })[]
): Promise<number> {
	const { count } = await tx.examJob.createMany({
		data: rows.map((j) => ({
			type: j.type,
			idempotencyKey: j.idempotencyKey,
			examDate: dayColumn(j.examDate),
			attemptId: j.attemptId ?? null,
			status: 'pending',
			runAfter: j.runAfter,
			maxAttempts: j.maxAttempts
		})),
		skipDuplicates: true
	})
	return count
}

export async function enqueueInTx(tx: Tx, jobs: readonly NewJob[]): Promise<number> {
	return enqueueJobs({ ...jobStore, enqueue: (rows) => createJobsIn(tx, rows) }, jobs)
}

// Open the exam if its window has started (random weighted selection, stored once, AC7). Safe to
// call from any request or tick: it changes nothing outside the window or once chosen.
export async function openIfDue(examDate: string): Promise<void> {
	const row = await db.dailyExam.findUnique({
		where: { examDate: dayColumn(examDate) },
		select: { status: true, opensAt: true, closesAt: true }
	})
	if (row == null || row.status !== 'scheduled') return
	const now = Date.now()
	if (now < row.opensAt.getTime() || now >= row.closesAt.getTime()) return
	try {
		await openExam(openStore, examDate)
	} catch (error) {
		captureError(error, { area: 'exam-open' })
	}
}

// ---- Views -----------------------------------------------------------------------------------

export type ExamPhase =
	'none' | 'scheduled' | 'open' | 'closed' | 'processing' | 'published' | 'cancelled'

export interface ExamPublicView {
	examDate: string
	phase: ExamPhase
	opensAt: string
	closesAt: string
	lateEntryUntil: string
	resultsDueAt: string
	publishAt: string
	serverNow: string
	isRepeat: boolean | null
	isTest: boolean
}

export async function examPublicView(examDate: string): Promise<ExamPublicView | null> {
	const [row, clock] = await Promise.all([
		db.dailyExam.findUnique({ where: { examDate: dayColumn(examDate) } }),
		db.$queryRaw<{ now: Date }[]>`SELECT now() AS now`
	])
	const now = clock[0]?.now ?? new Date()
	if (row == null) return null
	const t = now.getTime()
	const phase: ExamPhase =
		row.status === 'cancelled'
			? 'cancelled'
			: row.status === 'published' || row.status === 'archived'
				? 'published'
				: t < row.opensAt.getTime()
					? 'scheduled'
					: t < row.closesAt.getTime()
						? row.status === 'open' || row.status === 'scheduled'
							? 'open'
							: 'closed'
						: row.status === 'grading' || row.status === 'finalizing'
							? 'processing'
							: 'closed'
	return {
		examDate,
		phase,
		opensAt: row.opensAt.toISOString(),
		closesAt: row.closesAt.toISOString(),
		lateEntryUntil: row.lateEntryUntil.toISOString(),
		resultsDueAt: row.resultsDueAt.toISOString(),
		publishAt: row.publishAt.toISOString(),
		serverNow: now.toISOString(),
		// Only revealed once the exam has opened (AC5, AC50).
		isRepeat: row.status === 'scheduled' ? null : row.isRepeat,
		isTest: row.scheduleVersion.startsWith('test')
	}
}

export interface ExamProblemView {
	title: string
	statement: string[]
	examples: { args: unknown[]; output: unknown }[]
	starter: string
	entry: string
	params: { name: string }[]
}

// The statement for an ADMITTED participant while the exam is open (AC9), or for anyone once it
// is published for Practice (AC30). Never hidden cases or reference solutions.
export async function examProblemFor(
	userId: string,
	examDate: string
): Promise<ExamProblemView | null> {
	const rows = await db.$queryRaw<{ allowed: boolean }[]>`
		SELECT (now() < e."closesAt" AND a."status" IN ('admitted', 'submitted')) AS allowed
		FROM "daily_exams" e JOIN "exam_attempts" a ON a."examDate" = e."examDate"
		WHERE e."examDate" = ${dayColumn(examDate)} AND a."userId" = ${userId}::uuid AND e."problemId" IS NOT NULL`
	if (rows[0]?.allowed !== true) return null
	return problemViewOf(examDate)
}

export async function problemViewOf(examDate: string): Promise<ExamProblemView | null> {
	const exam = await db.dailyExam.findUnique({
		where: { examDate: dayColumn(examDate) },
		select: {
			problem: {
				select: { title: true, statement: true, examples: true, starter: true, entry: true }
			},
			problemId: true
		}
	})
	const p = exam?.problem
	if (p == null) return null
	const examples = p.examples as { args: unknown[]; output: unknown }[]
	return {
		title: p.title,
		statement: p.statement as string[],
		examples,
		starter: p.starter,
		entry: p.entry,
		params: paramsFromStarter(p.starter, p.entry)
	}
}

// The parameter names, read from the starter's signature (the pool does not store them separately).
function paramsFromStarter(starter: string, entry: string): { name: string }[] {
	const m = new RegExp(`def\\s+${entry}\\s*\\(([^)]*)\\)`).exec(starter)
	const raw = m?.[1] ?? ''
	return raw
		.split(',')
		.map((s) => s.split(':')[0]?.split('=')[0]?.trim() ?? '')
		.filter((s) => s.length > 0)
		.map((name) => ({ name }))
}

export interface AttemptView {
	id: string
	status: string
	admittedAt: string
	submittedAt: string | null
	submissionKind: string | null
	autosave: { source: string; clientSeq: number; savedAt: string } | null
}

export async function myAttempt(userId: string, examDate: string): Promise<AttemptView | null> {
	const a = await db.examAttempt.findUnique({
		where: { examDate_userId: { examDate: dayColumn(examDate), userId } },
		select: {
			id: true,
			status: true,
			admittedAt: true,
			submittedAt: true,
			submissionKind: true,
			autosave: { select: { source: true, clientSeq: true, savedAt: true } }
		}
	})
	if (a == null) return null
	return {
		id: a.id,
		status: a.status,
		admittedAt: a.admittedAt.toISOString(),
		submittedAt: a.submittedAt?.toISOString() ?? null,
		submissionKind: a.submissionKind,
		autosave:
			a.autosave == null ? null : { ...a.autosave, savedAt: a.autosave.savedAt.toISOString() }
	}
}

// ---- Learner writes (all gated by the DATABASE clock) ----------------------------------------

export const preflightSchemaKeys = [
	'camera',
	'microphone',
	'screen',
	'screenSurface',
	'fullscreen'
] as const

export type StartError = 'not_found' | 'not_open' | 'late' | 'closed' | 'preflight' | 'unavailable'

export async function startExam(
	userId: string,
	examDate: string,
	preflight: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: StartError }> {
	// The flags are CLIENT-REPORTED (AC21): we require a passing record, never treat it as proof.
	const passed =
		preflight.camera === true &&
		preflight.microphone === true &&
		preflight.screen === true &&
		preflight.screenSurface === 'monitor' &&
		preflight.fullscreen === true
	if (!passed) return { ok: false, error: 'preflight' }
	await openIfDue(examDate)
	const inserted = await db.$executeRaw`
		INSERT INTO "exam_attempts" ("id", "examDate", "userId", "status", "admittedAt", "preflight", "assessmentStatus")
		SELECT gen_random_uuid(), e."examDate", ${userId}::uuid, 'admitted', now(), ${JSON.stringify(preflight)}::jsonb, 'pending'
		FROM "daily_exams" e
		WHERE e."examDate" = ${dayColumn(examDate)} AND e."status" = 'open'
			AND e."opensAt" <= now() AND now() < e."lateEntryUntil"
		ON CONFLICT ("examDate", "userId") DO NOTHING`
	const attempt = await db.examAttempt.findUnique({
		where: { examDate_userId: { examDate: dayColumn(examDate), userId } },
		select: { id: true }
	})
	if (attempt != null) {
		if (inserted === 1) {
			const exam = await db.dailyExam.findUniqueOrThrow({
				where: { examDate: dayColumn(examDate) },
				select: { closesAt: true }
			})
			await enqueueJobs(jobStore, [
				{
					type: 'EXAM_INTEGRITY_SCORE',
					examDate,
					attemptId: attempt.id,
					runAfter: new Date(exam.closesAt.getTime() + INTEGRITY_SCORE_DELAY_MS)
				}
			])
		}
		return { ok: true }
	}
	const view = await examPublicView(examDate)
	if (view == null) return { ok: false, error: 'not_found' }
	if (view.phase === 'scheduled') return { ok: false, error: 'not_open' }
	if (view.phase !== 'open') return { ok: false, error: 'closed' }
	return { ok: false, error: 'late' }
}

export async function autosaveExam(
	userId: string,
	examDate: string,
	source: string,
	clientSeq: number
): Promise<
	{ ok: true; savedSeq: number } | { ok: false; error: 'closed' | 'too_large' | 'stale' }
> {
	if (new TextEncoder().encode(source).length > MAX_SOURCE_BYTES)
		return { ok: false, error: 'too_large' }
	const rows = await db.$queryRaw<{ clientSeq: number }[]>`
		INSERT INTO "exam_autosaves" ("attemptId", "source", "clientSeq", "savedAt")
		SELECT a."id", ${source}, ${clientSeq}, now()
		FROM "exam_attempts" a JOIN "daily_exams" e ON e."examDate" = a."examDate"
		WHERE a."examDate" = ${dayColumn(examDate)} AND a."userId" = ${userId}::uuid
			AND a."status" = 'admitted' AND now() < e."closesAt"
		ON CONFLICT ("attemptId") DO UPDATE SET "source" = EXCLUDED."source",
			"clientSeq" = EXCLUDED."clientSeq", "savedAt" = EXCLUDED."savedAt"
		WHERE "exam_autosaves"."clientSeq" < EXCLUDED."clientSeq"
		RETURNING "clientSeq"`
	if (rows.length === 1) return { ok: true, savedSeq: rows[0]?.clientSeq ?? clientSeq }
	const attempt = await myAttempt(userId, examDate)
	if (
		attempt?.status === 'admitted' &&
		attempt.autosave != null &&
		attempt.autosave.clientSeq >= clientSeq
	)
		return { ok: false, error: 'stale' }
	return { ok: false, error: 'closed' }
}

export async function submitExam(
	userId: string,
	examDate: string,
	source: string
): Promise<
	{ ok: true } | { ok: false; error: 'closed' | 'too_large' | 'empty' | 'already_submitted' }
> {
	if (source.trim() === '') return { ok: false, error: 'empty' }
	if (new TextEncoder().encode(source).length > MAX_SOURCE_BYTES)
		return { ok: false, error: 'too_large' }
	const result = await db.$transaction(async (tx) => {
		const rows = await tx.$queryRaw<{ id: string }[]>`
			UPDATE "exam_attempts" a SET "status" = 'submitted', "source" = ${source},
				"submittedAt" = now(), "submissionKind" = 'manual'
			FROM "daily_exams" e
			WHERE a."examDate" = e."examDate" AND a."examDate" = ${dayColumn(examDate)}
				AND a."userId" = ${userId}::uuid AND a."status" = 'admitted' AND now() < e."closesAt"
			RETURNING a."id"`
		const id = rows[0]?.id
		if (id == null) return null
		await enqueueInTx(tx, [{ type: 'EXAM_GRADE', examDate, attemptId: id, runAfter: new Date() }])
		return id
	})
	if (result != null) return { ok: true }
	const attempt = await myAttempt(userId, examDate)
	return {
		ok: false,
		error: attempt != null && attempt.status !== 'admitted' ? 'already_submitted' : 'closed'
	}
}

// Integrity events: ingested directly (never a job per event), own attempt only, until 60 s after
// closing, deduplicated, rate-limited, allow-listed metadata only (AC24).
export interface IncomingEvent {
	clientEventId: string
	clientSeq: number
	type: string
	occurredAt?: string
	screenCount?: number
}

const ALLOWED = new Set<string>(EVENT_TYPES)
const CONFIDENCE: Partial<Record<IntegrityEventType, 'observed' | 'indicator' | 'unsupported'>> = {
	tab_hidden: 'observed',
	tab_visible: 'observed',
	fullscreen_exited: 'observed',
	fullscreen_entered: 'observed',
	paste_blocked: 'observed',
	drag_insert_blocked: 'observed',
	screens_unsupported: 'unsupported',
	screens_denied: 'unsupported'
}

export async function recordEvents(
	userId: string,
	examDate: string,
	events: readonly IncomingEvent[]
): Promise<{ accepted: number; duplicates: number; rejected: number }> {
	const rows = await db.$queryRaw<{ id: string; seq: number | null; recent: number }[]>`
		SELECT a."id",
			(SELECT max(ev."clientSeq") FROM "exam_integrity_events" ev WHERE ev."attemptId" = a."id") AS seq,
			(SELECT count(*)::int FROM "exam_integrity_events" ev WHERE ev."attemptId" = a."id"
				AND ev."receivedAt" > now() - interval '1 minute') AS recent
		FROM "exam_attempts" a JOIN "daily_exams" e ON e."examDate" = a."examDate"
		WHERE a."examDate" = ${dayColumn(examDate)} AND a."userId" = ${userId}::uuid
			AND now() < e."closesAt" + make_interval(secs => ${LATE_EVENT_WINDOW_SECONDS})`
	const attempt = rows[0]
	if (attempt == null) return { accepted: 0, duplicates: 0, rejected: events.length }
	const valid = events
		.slice(0, MAX_EVENTS_PER_BATCH)
		.filter((e) => ALLOWED.has(e.type) && e.type !== 'delivery_gap' && e.type !== 'rate_limited')
	const room = Math.max(0, MAX_EVENTS_PER_MINUTE - attempt.recent)
	const kept = valid.slice(0, room)
	const data = kept.map((e) => ({
		attemptId: attempt.id,
		type: e.type,
		clientEventId: e.clientEventId.slice(0, 64),
		clientSeq: Math.trunc(e.clientSeq),
		occurredAt:
			e.occurredAt == null || Number.isNaN(Date.parse(e.occurredAt))
				? null
				: new Date(e.occurredAt),
		confidence: CONFIDENCE[e.type as IntegrityEventType] ?? 'indicator',
		meta:
			(e.type === 'screens_reported' || e.type === 'screens_changed') &&
			Number.isInteger(e.screenCount) &&
			(e.screenCount ?? 0) > 0 &&
			(e.screenCount ?? 0) < 32
				? { screenCount: e.screenCount }
				: undefined
	}))
	// A jump in the client's sequence is recorded as uncertainty, never as a violation.
	const minSeq = Math.min(...kept.map((e) => e.clientSeq))
	if (kept.length > 0 && attempt.seq != null && minSeq > attempt.seq + 1)
		data.push({
			attemptId: attempt.id,
			type: 'delivery_gap',
			clientEventId: `gap-${attempt.seq}-${minSeq}`,
			clientSeq: -1,
			occurredAt: null,
			confidence: 'unsupported',
			meta: undefined
		})
	if (valid.length > kept.length)
		data.push({
			attemptId: attempt.id,
			type: 'rate_limited',
			clientEventId: `rl-${Date.now()}`,
			clientSeq: -1,
			occurredAt: null,
			confidence: 'unsupported',
			meta: undefined
		})
	const { count } = await db.examIntegrityEvent.createMany({ data, skipDuplicates: true })
	return {
		accepted: Math.min(count, kept.length),
		duplicates: kept.length - Math.min(count, kept.length),
		rejected: events.length - kept.length
	}
}

export const todayExamDate = () => examDateOf(new Date())
export { day as dayString }
