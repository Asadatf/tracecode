// The M10 durable exam job queue (specs/features/daily-exam.md § M, AC35–AC41; ADR-0010 §12).
//
// Pure orchestration over an injected store, like src/lib/challenge/service.ts: every state
// change is ONE conditional write the store must implement atomically (the Prisma store is a
// conditional `updateMany`), and the clock is injected. So the guarantees that matter — one
// claimant per job, fenced completion, bounded retries, a dead letter, dependency gates, an exact
// Sandbox-slot bound, a time budget — are tested against a fake that behaves like the database.
//
// There is no long-running worker: `runWorker` is ONE bounded invocation (a tick, a cron backstop
// or a participant nudge). Correctness never depends on when, or whether, an invocation arrives:
// exam timing is enforced by database timestamps on every request (AC3).

export const JOB_TYPES = [
	'EXAM_CLOSEOUT',
	'EXAM_GRADE',
	'EXAM_INTEGRITY_SCORE',
	'EXAM_AI_EVALUATION',
	'EXAM_RESULT_FINALIZATION',
	'EXAM_LEADERBOARD_FINALIZATION',
	'EXAM_NOTIFICATIONS',
	'EXAM_PROBLEM_PUBLICATION',
	'EXAM_RETENTION_CLEANUP'
] as const
export type JobType = (typeof JOB_TYPES)[number]

export const JOB_STATUSES = ['pending', 'running', 'succeeded', 'dead', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

// Per-type attempt bounds (AC39). A grade gets ~15 minutes of retries before it goes dead.
export const MAX_ATTEMPTS: Readonly<Record<JobType, number>> = {
	EXAM_CLOSEOUT: 8,
	EXAM_GRADE: 5,
	EXAM_INTEGRITY_SCORE: 8,
	EXAM_AI_EVALUATION: 4,
	EXAM_RESULT_FINALIZATION: 8,
	EXAM_LEADERBOARD_FINALIZATION: 8,
	EXAM_NOTIFICATIONS: 8,
	EXAM_PROBLEM_PUBLICATION: 8,
	EXAM_RETENTION_CLEANUP: 8
}

// One lease for every type, longer than a Sandbox run AND the 300 s function lifetime, so a
// live worker is never overlapped; a crashed one is recovered once it expires (AC38).
export const LEASE_MS = 6 * 60 * 1000
export const MAX_FUNCTION_MS = 300 * 1000
// Backoff: runAfter = now + min(cap, base × 2^attempts) (AC39).
export const BACKOFF_BASE_MS = 30 * 1000
export const BACKOFF_CAP_MS = 10 * 60 * 1000
// A job whose prerequisites are not met yet is put back without spending an attempt.
export const NOT_READY_DELAY_MS = 30 * 1000
// No free Sandbox slot: try again shortly, also without spending an attempt.
export const NO_SLOT_DELAY_MS = 15 * 1000
// An invocation stops CLAIMING here; work already claimed may finish within the 300 s limit (AC40).
export const DEFAULT_CLAIM_BUDGET_MS = 240 * 1000
// Types that need a global Sandbox slot (AC37).
export const SLOT_TYPES: ReadonlySet<JobType> = new Set<JobType>(['EXAM_GRADE'])

export function backoffMs(attempts: number): number {
	return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts))
}

// type:examDate[:attemptId][:correction] — unique, so a duplicate enqueue inserts nothing (AC36).
export function idempotencyKey(input: {
	type: JobType
	examDate: string
	attemptId?: string | null
	correction?: number | null
}): string {
	const parts: string[] = [input.type, input.examDate]
	if (input.attemptId != null) parts.push(input.attemptId)
	if (input.correction != null && input.correction > 0) parts.push(`c${input.correction}`)
	return parts.join(':')
}

export interface NewJob {
	type: JobType
	examDate: string
	attemptId?: string | null
	correction?: number | null
	runAfter: Date
}

export interface JobRow {
	id: string
	type: JobType
	idempotencyKey: string
	examDate: string
	attemptId: string | null
	status: JobStatus
	runAfter: Date
	attempts: number
	maxAttempts: number
	leaseToken: string | null
	leaseExpiresAt: Date | null
	lastErrorCode: string | null
}

// What a job a worker holds may do. Every write is fenced on (id, status = running, leaseToken):
// a worker whose lease was taken over can no longer change the row (AC38).
export interface JobStore {
	// Inserts the jobs whose keys are new (skipDuplicates). Returns how many were inserted. In
	// production this runs inside the same transaction as the state change that causes the jobs.
	enqueue(
		jobs: readonly (NewJob & { idempotencyKey: string; maxAttempts: number })[]
	): Promise<number>
	// Up to `limit` candidate ids that look claimable at `now`: pending and due, or running with an
	// expired lease. Only a hint — the claim itself decides.
	candidates(now: Date, limit: number): Promise<JobRow[]>
	// pending AND runAfter <= now -> running (token, lease). Does not spend an attempt.
	claimPending(id: string, token: string, now: Date, leaseUntil: Date): Promise<boolean>
	// running AND leaseExpiresAt < now -> running with a new token. A lost lease (crash, timeout,
	// redeploy) spends an attempt; once attempts reach maxAttempts the store marks the job dead
	// instead. 'lost' means another worker got there first.
	reclaimExpired(
		id: string,
		token: string,
		now: Date,
		leaseUntil: Date
	): Promise<{ outcome: 'claimed'; attempts: number } | { outcome: 'dead' } | { outcome: 'lost' }>
	// running(token) -> succeeded.
	complete(id: string, token: string, now: Date): Promise<boolean>
	// running(token) -> pending (runAfter) WITHOUT spending an attempt: not ready / no slot.
	defer(id: string, token: string, runAfter: Date): Promise<boolean>
	// running(token) -> pending (attempts + 1, runAfter, code), or -> dead (attempts + 1, code) when
	// runAfter is null. Returns what happened, or 'lost' if the lease was taken over.
	fail(
		id: string,
		token: string,
		now: Date,
		code: string,
		runAfter: Date | null
	): Promise<'retry' | 'dead' | 'lost'>
	// Lease one free (or expired) Sandbox slot to `token`; null when all N are held.
	acquireSlot(token: string, jobId: string, now: Date, leaseUntil: Date): Promise<number | null>
	releaseSlot(slot: number, token: string): Promise<void>
}

export type ReadyCheck = { ready: true } | { ready: false; retryInMs?: number }

export type RunOutcome =
	| { ok: true }
	// `permanent` skips the remaining retries (e.g. a job whose subject no longer exists).
	| { ok: false; code: string; permanent?: boolean }

export interface JobContext {
	now: () => Date
	// Fencing for effects the handler writes: only a worker still holding the lease may write.
	leaseToken: string
}

export interface JobHandler {
	// Dependency gate (AC35): prerequisites terminal? Checked after the claim, so a not-ready job
	// is simply deferred and never spends an attempt.
	ready(job: JobRow): Promise<ReadyCheck>
	run(job: JobRow, ctx: JobContext): Promise<RunOutcome>
	// Called once when the job goes dead, so the domain records it (e.g. a dead grade makes the
	// attempt `grading_failed`, which still lets finalisation proceed). Best effort.
	onDead?(job: JobRow): Promise<void>
}

export type JobHandlers = Readonly<Record<JobType, JobHandler>>

export async function enqueueJobs(store: JobStore, jobs: readonly NewJob[]): Promise<number> {
	if (jobs.length === 0) return 0
	return store.enqueue(
		jobs.map((job) => ({
			...job,
			idempotencyKey: idempotencyKey(job),
			maxAttempts: MAX_ATTEMPTS[job.type]
		}))
	)
}

export interface WorkerStats {
	claimed: number
	succeeded: number
	retried: number
	dead: number
	deferred: number
	// Fenced writes refused because the lease had been taken over (a stale worker).
	stale: number
	byType: Partial<Record<JobType, number>>
	stoppedBy: 'idle' | 'budget' | 'max_jobs'
}

export interface WorkerOptions {
	store: JobStore
	handlers: JobHandlers
	now: () => Date
	newToken: () => string
	claimBudgetMs?: number
	maxJobs?: number
	// Only these types (e.g. a participant nudge for its own attempt). Default: all.
	filter?: (job: JobRow) => boolean
	batchSize?: number
}

// ONE bounded worker invocation (AC40). It claims due jobs until it runs out of work, out of its
// claim budget, or reaches maxJobs. Slot jobs (Sandbox grades) in each batch run in parallel up to
// the slots it can lease; the rest run one by one.
export async function runWorker(options: WorkerOptions): Promise<WorkerStats> {
	const { store, handlers, now, newToken } = options
	const budget = options.claimBudgetMs ?? DEFAULT_CLAIM_BUDGET_MS
	const maxJobs = options.maxJobs ?? Number.POSITIVE_INFINITY
	const batchSize = options.batchSize ?? 10
	const startedAt = now().getTime()
	const stats: WorkerStats = {
		claimed: 0,
		succeeded: 0,
		retried: 0,
		dead: 0,
		deferred: 0,
		stale: 0,
		byType: {},
		stoppedBy: 'idle'
	}

	for (;;) {
		if (now().getTime() - startedAt >= budget) {
			stats.stoppedBy = 'budget'
			break
		}
		if (stats.claimed >= maxJobs) {
			stats.stoppedBy = 'max_jobs'
			break
		}
		const rows = (await store.candidates(now(), batchSize)).filter(
			(row) => options.filter == null || options.filter(row)
		)
		const held: { job: JobRow; token: string }[] = []
		for (const row of rows) {
			if (stats.claimed + held.length >= maxJobs) break
			if (now().getTime() - startedAt >= budget) break
			const token = newToken()
			const at = now()
			const leaseUntil = new Date(at.getTime() + LEASE_MS)
			let attempts: number | null = null
			if (row.status === 'pending') {
				if (await store.claimPending(row.id, token, at, leaseUntil)) attempts = row.attempts
			} else if (row.status === 'running') {
				const reclaim = await store.reclaimExpired(row.id, token, at, leaseUntil)
				if (reclaim.outcome === 'dead') {
					stats.dead += 1
					await safeOnDead(handlers[row.type], row)
				} else if (reclaim.outcome === 'claimed') attempts = reclaim.attempts
			}
			if (attempts != null)
				held.push({ job: { ...row, status: 'running', leaseToken: token, attempts }, token })
		}
		if (held.length === 0) break
		stats.claimed += held.length
		for (const { job } of held) stats.byType[job.type] = (stats.byType[job.type] ?? 0) + 1

		const slotJobs = held.filter(({ job }) => SLOT_TYPES.has(job.type))
		const otherJobs = held.filter(({ job }) => !SLOT_TYPES.has(job.type))
		await Promise.all(slotJobs.map((entry) => process(entry, true)))
		for (const entry of otherJobs) await process(entry, false)
	}
	return stats

	async function process(entry: { job: JobRow; token: string }, needsSlot: boolean): Promise<void> {
		const { job, token } = entry
		const handler = handlers[job.type]
		const gate = await handler.ready(job).catch((): ReadyCheck => ({ ready: false }))
		if (!gate.ready) {
			await deferJob(job, token, gate.retryInMs ?? NOT_READY_DELAY_MS)
			return
		}
		let slot: number | null = null
		if (needsSlot) {
			const at = now()
			slot = await store.acquireSlot(token, job.id, at, new Date(at.getTime() + LEASE_MS))
			if (slot == null) {
				await deferJob(job, token, NO_SLOT_DELAY_MS)
				return
			}
		}
		try {
			let outcome: RunOutcome
			try {
				outcome = await handler.run(job, { now, leaseToken: token })
			} catch {
				outcome = { ok: false, code: 'exception' }
			}
			if (outcome.ok) {
				if (await store.complete(job.id, token, now())) stats.succeeded += 1
				else stats.stale += 1
				return
			}
			const attemptsAfter = job.attempts + 1
			const exhausted = outcome.permanent === true || attemptsAfter >= job.maxAttempts
			const at = now()
			const result = await store.fail(
				job.id,
				token,
				at,
				outcome.code,
				exhausted ? null : new Date(at.getTime() + backoffMs(attemptsAfter))
			)
			if (result === 'retry') stats.retried += 1
			else if (result === 'dead') {
				stats.dead += 1
				await safeOnDead(handler, job)
			} else stats.stale += 1
		} finally {
			if (slot != null) await store.releaseSlot(slot, token)
		}
	}

	async function deferJob(job: JobRow, token: string, delayMs: number): Promise<void> {
		if (await store.defer(job.id, token, new Date(now().getTime() + delayMs))) stats.deferred += 1
		else stats.stale += 1
	}
}

async function safeOnDead(handler: JobHandler, job: JobRow): Promise<void> {
	try {
		await handler.onDead?.(job)
	} catch {
		// Best effort: the job is already dead and visible to admins (AC41).
	}
}
