import 'server-only'
import { db } from '@/server/db/client'
import { dayColumn } from '@/lib/reviews/review-queries'
import { SUBMIT_GRACE_MS } from '@/lib/challenge/exam-rules'
import type { ChallengeCatalogStore } from '@/lib/challenge/assignment'
import type { AttemptRow, ChallengeAttemptStore } from '@/lib/challenge/service'
import { isMeaningfulAttempt } from '@/lib/streak/attempt-meaning'

// Prisma wiring for the challenge stores. Every write is ONE conditional statement (or
// one transaction) on the state the caller expects; every query is keyed by the learner
// id the server resolved from the session, never by request input.

const day = (date: Date) => date.toISOString().slice(0, 10)

export const catalogStore: ChallengeCatalogStore = {
	async find(date) {
		const row = await db.dailyChallenge.findUnique({ where: { challengeDate: dayColumn(date) } })
		return row == null
			? null
			: { challengeDate: day(row.challengeDate), problemSlug: row.problemSlug }
	},
	async pin(date, problemSlug) {
		await db.dailyChallenge.createMany({
			data: [{ challengeDate: dayColumn(date), problemSlug }],
			skipDuplicates: true
		})
	}
}

const ATTEMPT_SELECT = {
	id: true,
	userId: true,
	challengeDate: true,
	status: true,
	startedAt: true,
	deadlineAt: true,
	submittedAt: true,
	elapsedMs: true,
	testsPassed: true,
	testsTotal: true,
	score: true,
	gradeError: true
} as const

export const attemptStore: ChallengeAttemptStore = {
	async find(userId, date) {
		const row = await db.challengeAttempt.findUnique({
			where: { userId_challengeDate: { userId, challengeDate: dayColumn(date) } },
			select: ATTEMPT_SELECT
		})
		return row == null
			? null
			: ({ ...row, challengeDate: day(row.challengeDate) } satisfies AttemptRow)
	},

	async create({ userId, date, startedAt, deadlineAt, weekStart }) {
		const { count } = await db.challengeAttempt.createMany({
			data: [
				{
					userId,
					challengeDate: dayColumn(date),
					startedAt,
					deadlineAt,
					status: 'started',
					weekStart: dayColumn(weekStart)
				}
			],
			// The (user, date) unique key: a second Start is a no-op, never a new clock.
			skipDuplicates: true
		})
		return count === 1
	},

	async submit({ userId, date, source, submittedAt, elapsedMs }) {
		const { count } = await db.challengeAttempt.updateMany({
			where: {
				userId,
				challengeDate: dayColumn(date),
				status: 'started',
				// The deadline is enforced IN the write, so a late request cannot slip in
				// between a read and this update.
				deadlineAt: { gte: new Date(submittedAt.getTime() - SUBMIT_GRACE_MS) }
			},
			data: { status: 'submitted', source, submittedAt, elapsedMs }
		})
		return count === 1
	},

	async expire(userId, date, now) {
		const { count } = await db.challengeAttempt.updateMany({
			where: {
				userId,
				challengeDate: dayColumn(date),
				status: 'started',
				deadlineAt: { lt: new Date(now.getTime() - SUBMIT_GRACE_MS) }
			},
			data: { status: 'expired' }
		})
		return count === 1
	},

	async claimGrading(userId, date, now, staleBefore) {
		const { count } = await db.challengeAttempt.updateMany({
			where: {
				userId,
				challengeDate: dayColumn(date),
				OR: [
					{ status: 'submitted' },
					{ status: 'grader_error' },
					{ status: 'grading', gradingClaimedAt: { lt: staleBefore } }
				]
			},
			data: { status: 'grading', gradingClaimedAt: now }
		})
		return count === 1
	},

	async completeGrading(userId, date, record, at) {
		return db.$transaction(async (tx) => {
			// The only write that sets a score, and only from 'grading'.
			const { count } = await tx.challengeAttempt.updateMany({
				where: { userId, challengeDate: dayColumn(date), status: 'grading' },
				data: {
					status: 'graded',
					gradedAt: at,
					testsPassed: record.testsPassed,
					testsTotal: record.testsTotal,
					score: record.score,
					graderVersion: record.graderVersion,
					gradeError: null
				}
			})
			if (count !== 1) return false
			// A fully verified pass is also a real solve: record it once as an Attempt so
			// the streak and activity graph count it with their existing semantics, and
			// reflect it in the learner's progress. Only the transition winner gets here.
			if (record.testsTotal > 0 && record.testsPassed === record.testsTotal) {
				const row = await tx.challengeAttempt.findUnique({
					where: { userId_challengeDate: { userId, challengeDate: dayColumn(date) } },
					select: { source: true, challenge: { select: { problemSlug: true } } }
				})
				if (row?.source != null) {
					const slug = row.challenge.problemSlug
					const attempt = await tx.attempt.create({
						data: {
							userId,
							problemSlug: slug,
							source: row.source,
							status: 'completed',
							testsPassed: record.testsPassed,
							testsTotal: record.testsTotal,
							allPassed: true,
							meaningful: isMeaningfulAttempt(slug, row.source)
						},
						select: { id: true }
					})
					await tx.challengeAttempt.update({
						where: { userId_challengeDate: { userId, challengeDate: dayColumn(date) } },
						data: { attemptId: attempt.id }
					})
					const existing = await tx.problemProgress.findUnique({
						where: { userId_problemSlug: { userId, problemSlug: slug } }
					})
					await tx.problemProgress.upsert({
						where: { userId_problemSlug: { userId, problemSlug: slug } },
						create: {
							userId,
							problemSlug: slug,
							status: 'solved',
							attempts: 1,
							bestTestsPassed: record.testsPassed,
							testsTotal: record.testsTotal,
							firstSolvedAt: at,
							latestSolvedAt: at
						},
						update: {
							status: 'solved',
							attempts: { increment: 1 },
							bestTestsPassed: Math.max(existing?.bestTestsPassed ?? 0, record.testsPassed),
							testsTotal: record.testsTotal,
							firstSolvedAt: existing?.firstSolvedAt ?? at,
							latestSolvedAt: at
						}
					})
				}
			}
			return true
		})
	},

	async failGrading(userId, date, code) {
		const { count } = await db.challengeAttempt.updateMany({
			where: { userId, challengeDate: dayColumn(date), status: 'grading' },
			data: { status: 'grader_error', gradeError: code }
		})
		return count === 1
	},

	async readSource(userId, date) {
		const row = await db.challengeAttempt.findUnique({
			where: { userId_challengeDate: { userId, challengeDate: dayColumn(date) } },
			select: { source: true }
		})
		return row?.source ?? null
	}
}
