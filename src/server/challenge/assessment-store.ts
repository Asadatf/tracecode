import 'server-only'
import { db, Prisma } from '@/server/db/client'
import { dayColumn } from '@/lib/reviews/review-queries'
import type { Assessment, AssessmentStore } from '@/lib/challenge/assessment'

// Prisma wiring for the one stored AI assessment per challenge attempt. Every write is a
// single conditional update on the state the caller expects, keyed by the learner id the
// server resolved from the session. The two columns arrive with their migration: until
// then every call here fails (undefined column), which the policy reads as "no
// assessment, make no AI call".

const where = (userId: string, date: string) => ({ userId, challengeDate: dayColumn(date) })

export const assessmentStore: AssessmentStore = {
	async read(userId, date) {
		const row = await db.challengeAttempt.findUnique({
			where: { userId_challengeDate: where(userId, date) },
			select: { assessment: true, assessmentClaimedAt: true }
		})
		return row == null ? null : { assessment: row.assessment, claimedAt: row.assessmentClaimedAt }
	},

	async claim(userId, date, now, staleBefore) {
		const { count } = await db.challengeAttempt.updateMany({
			where: {
				...where(userId, date),
				assessment: { equals: Prisma.DbNull },
				OR: [{ assessmentClaimedAt: null }, { assessmentClaimedAt: { lt: staleBefore } }]
			},
			data: { assessmentClaimedAt: now }
		})
		return count === 1
	},

	async save(userId, date, assessment: Assessment) {
		const { count } = await db.challengeAttempt.updateMany({
			where: { ...where(userId, date), assessment: { equals: Prisma.DbNull } },
			data: { assessment: assessment as unknown as Prisma.InputJsonValue }
		})
		return count === 1
	}
}
