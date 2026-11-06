import 'server-only'
import { db, Prisma } from '@/server/db/client'
import { dayColumn } from '@/lib/reviews/review-queries'
import type { JobRow, JobStore, JobType } from '@/lib/exam/queue'
import type { OpenStore, PoolCandidate, SelectionRecord } from '@/lib/exam/selection'

// Prisma wiring for the M10 queue and the race-safe exam opening (specs/features/daily-exam.md
// AC7, AC35–AC41). Every state change is ONE conditional statement. The few that must compare
// against the DATABASE clock, or compare two columns, use parameterised $executeRaw /
// $queryRaw (docs/rules/database.md: only where Prisma cannot express the query).

export const GRADING_SLOTS = 4
const day = (d: Date) => d.toISOString().slice(0, 10)

type JobDbRow = {
	id: string
	type: string
	idempotencyKey: string
	examDate: Date
	attemptId: string | null
	status: string
	runAfter: Date
	attempts: number
	maxAttempts: number
	leaseToken: string | null
	leaseExpiresAt: Date | null
	lastErrorCode: string | null
}
const toJob = (r: JobDbRow): JobRow => ({
	...r,
	type: r.type as JobType,
	status: r.status as JobRow['status'],
	examDate: day(r.examDate)
})

export const jobStore: JobStore = {
	async enqueue(jobs) {
		const { count } = await db.examJob.createMany({
			data: jobs.map((j) => ({
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
	},
	async candidates(now, limit) {
		const rows = await db.examJob.findMany({
			where: {
				OR: [
					{ status: 'pending', runAfter: { lte: now } },
					{ status: 'running', leaseExpiresAt: { lt: now } }
				]
			},
			orderBy: { runAfter: 'asc' },
			take: limit
		})
		return rows.map(toJob)
	},
	async claimPending(id, token, now, leaseUntil) {
		const { count } = await db.examJob.updateMany({
			where: { id, status: 'pending', runAfter: { lte: now } },
			data: { status: 'running', leaseToken: token, leaseExpiresAt: leaseUntil, startedAt: now }
		})
		return count === 1
	},
	async reclaimExpired(id, token, now, leaseUntil) {
		// attempts + 1 against the row's own maxAttempts: a column comparison, so raw SQL.
		const rows = await db.$queryRaw<{ status: string; attempts: number }[]>`
			UPDATE "exam_jobs" SET
				"attempts" = "attempts" + 1,
				"status" = CASE WHEN "attempts" + 1 >= "maxAttempts" THEN 'dead' ELSE 'running' END,
				"leaseToken" = CASE WHEN "attempts" + 1 >= "maxAttempts" THEN NULL ELSE ${token}::uuid END,
				"leaseExpiresAt" = CASE WHEN "attempts" + 1 >= "maxAttempts" THEN NULL ELSE ${leaseUntil} END,
				"lastErrorCode" = 'lease_expired',
				"finishedAt" = CASE WHEN "attempts" + 1 >= "maxAttempts" THEN ${now} ELSE NULL END
			WHERE "id" = ${id}::uuid AND "status" = 'running' AND "leaseExpiresAt" < ${now}
			RETURNING "status", "attempts"`
		const row = rows[0]
		if (row == null) return { outcome: 'lost' }
		return row.status === 'dead'
			? { outcome: 'dead' }
			: { outcome: 'claimed', attempts: row.attempts }
	},
	async complete(id, token, now) {
		const { count } = await db.examJob.updateMany({
			where: { id, status: 'running', leaseToken: token },
			data: { status: 'succeeded', leaseToken: null, leaseExpiresAt: null, finishedAt: now }
		})
		return count === 1
	},
	async defer(id, token, runAfter) {
		const { count } = await db.examJob.updateMany({
			where: { id, status: 'running', leaseToken: token },
			data: { status: 'pending', runAfter, leaseToken: null, leaseExpiresAt: null }
		})
		return count === 1
	},
	async fail(id, token, now, code, runAfter) {
		const { count } = await db.examJob.updateMany({
			where: { id, status: 'running', leaseToken: token },
			data:
				runAfter == null
					? {
							status: 'dead',
							attempts: { increment: 1 },
							lastErrorCode: code,
							leaseToken: null,
							leaseExpiresAt: null,
							finishedAt: now
						}
					: {
							status: 'pending',
							attempts: { increment: 1 },
							lastErrorCode: code,
							runAfter,
							leaseToken: null,
							leaseExpiresAt: null
						}
		})
		if (count !== 1) return 'lost'
		return runAfter == null ? 'dead' : 'retry'
	},
	async acquireSlot(token, jobId, now, leaseUntil) {
		await db.examJobSlot.createMany({
			data: Array.from({ length: GRADING_SLOTS }, (_, i) => ({ slot: i + 1 })),
			skipDuplicates: true
		})
		for (let slot = 1; slot <= GRADING_SLOTS; slot += 1) {
			const { count } = await db.examJobSlot.updateMany({
				where: { slot, OR: [{ leaseToken: null }, { leaseExpiresAt: { lt: now } }] },
				data: { leaseToken: token, leaseExpiresAt: leaseUntil, jobId }
			})
			if (count === 1) return slot
		}
		return null
	},
	async releaseSlot(slot, token) {
		await db.examJobSlot.updateMany({
			where: { slot, leaseToken: token },
			data: { leaseToken: null, leaseExpiresAt: null, jobId: null }
		})
	}
}

// ---- Opening ---------------------------------------------------------------------------------

export const openStore: OpenStore = {
	async read(examDate) {
		const row = await db.dailyExam.findUnique({
			where: { examDate: dayColumn(examDate) },
			select: { status: true, problemId: true, isRepeat: true }
		})
		return row
	},
	async loadPool(examDate) {
		const [eligible, past] = await Promise.all([
			db.examProblem.findMany({ where: { status: 'eligible' }, select: { id: true } }),
			db.dailyExam.findMany({
				where: {
					problemId: { not: null },
					examDate: { lt: dayColumn(examDate) }
					// Test exams count too: their problem has been seen (and may be published), so a later
					// exam on it is honestly a repeat.
				},
				select: { examDate: true, problemId: true }
			})
		])
		const history = past.map((p) => ({ examDate: day(p.examDate), problemId: p.problemId }))
		return eligible.map((e): PoolCandidate => {
			const uses = history.filter((h) => h.problemId === e.id)
			const last = uses.reduce<string | null>(
				(m, h) => (m == null || h.examDate > m ? h.examDate : m),
				null
			)
			return { id: e.id, priorUses: uses.length, lastUsed: last }
		})
	},
	async tryOpen(examDate, problemId, isRepeat, record: SelectionRecord) {
		// The DATABASE clock decides the window (AC3, AC7, AC47).
		const count = await db.$executeRaw`
			UPDATE "daily_exams" SET "status" = 'open', "problemId" = ${problemId}::uuid,
				"isRepeat" = ${isRepeat}, "selection" = ${JSON.stringify(record)}::jsonb, "openedAt" = now()
			WHERE "examDate" = ${dayColumn(examDate)} AND "status" = 'scheduled' AND "problemId" IS NULL
				AND "opensAt" <= now() AND now() < "closesAt"`
		return count === 1
	},
	async tryCancelEmpty(examDate) {
		const { count } = await db.dailyExam.updateMany({
			where: { examDate: dayColumn(examDate), status: 'scheduled', problemId: null },
			data: { status: 'cancelled', cancelReason: 'no_problem', cancelledAt: new Date() }
		})
		return count === 1
	}
}

export const jsonNull = Prisma.DbNull
