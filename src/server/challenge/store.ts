import 'server-only'
import { db } from '@/server/db/client'
import { dayColumn } from '@/lib/reviews/review-queries'
import type { ChallengeCatalogStore } from '@/lib/challenge/assignment'
import type { AttemptRow, ChallengeAttemptStore } from '@/lib/challenge/service'
import { isMeaningfulAttempt } from '@/lib/streak/attempt-meaning'
import { trackReviewPass } from '@/server/reviews/reviews'
import { notifyChallengeResult } from './notify'

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
	gradeError: true,
	gradingClaimedAt: true
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
				// The ONE final submission: the state change itself is the lock, so a duplicate
				// or simultaneous request finds it already moved on. No deadline condition: the
				// 30 minutes is a soft target. ('expired' is a leftover of the earlier exam design.)
				status: { in: ['started', 'expired'] }
			},
			data: { status: 'submitted', source, submittedAt, elapsedMs }
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
		// Filled by the transaction when this call wins a fully verified, meaningful pass.
		let review: { slug: string; submittedAt: Date } | null = null
		const won = await db.$transaction(async (tx) => {
			const { count } = await tx.challengeAttempt.updateMany({
				where: { userId, challengeDate: dayColumn(date), status: 'grading' },
				data: {
					status: 'graded',
					gradedAt: at,
					testsPassed: record.testsPassed,
					testsTotal: record.testsTotal,
					graderVersion: record.graderVersion,
					gradeError: null
				}
			})
			if (count !== 1) return false
			// A fully verified pass is also a real solve: record it once as an Attempt so the
			// streak and activity graph count it with their existing semantics, and reflect it
			// in the learner's progress. Only the transition winner gets here. Everything is
			// dated at the SUBMISSION, not at the later grading, so a submit just before UTC
			// midnight still counts for the day it was made. A failed submission records none.
			if (record.testsTotal > 0 && record.testsPassed === record.testsTotal) {
				const row = await tx.challengeAttempt.findUnique({
					where: { userId_challengeDate: { userId, challengeDate: dayColumn(date) } },
					select: {
						source: true,
						submittedAt: true,
						challenge: { select: { problemSlug: true } }
					}
				})
				if (row?.source != null && row.submittedAt != null) {
					const slug = row.challenge.problemSlug
					const solvedAt = row.submittedAt
					const meaningful = isMeaningfulAttempt(slug, row.source)
					const attempt = await tx.attempt.create({
						data: {
							userId,
							problemSlug: slug,
							source: row.source,
							createdAt: solvedAt,
							status: 'completed',
							testsPassed: record.testsPassed,
							testsTotal: record.testsTotal,
							allPassed: true,
							meaningful
						},
						select: { id: true }
					})
					await tx.challengeAttempt.update({
						where: { userId_challengeDate: { userId, challengeDate: dayColumn(date) } },
						data: { attemptId: attempt.id },
						select: { id: true }
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
							firstSolvedAt: solvedAt,
							latestSolvedAt: solvedAt
						},
						update: {
							status: 'solved',
							attempts: { increment: 1 },
							bestTestsPassed: Math.max(existing?.bestTestsPassed ?? 0, record.testsPassed),
							testsTotal: record.testsTotal,
							firstSolvedAt: existing?.firstSolvedAt ?? solvedAt,
							latestSolvedAt: solvedAt
						}
					})
					if (meaningful !== false) review = { slug, submittedAt: solvedAt }
				}
			}
			return true
		})
		// Spaced repetition (M9C), dated at the submission. Only the single transition winner
		// reaches here, and the review cycle itself is keyed by the attempt's own time, so a
		// replay can never advance a later stage. Best effort: it never fails the grading.
		if (won && review != null) {
			const { slug, submittedAt } = review
			await trackReviewPass(userId, slug, submittedAt)
		}
		// The learner is told their result is ready, pass or fail. Only the winner, once.
		if (won) await notifyChallengeResult(userId, date, record)
		return won
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
