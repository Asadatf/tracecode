import 'server-only'
import { db, Prisma } from '@/server/db/client'
import { captureError } from '@/lib/observability/capture-error'
import {
	CHALLENGE_RESULT_KIND,
	buildChallengeResult,
	challengeResultKey
} from '@/lib/challenge/notification'
import { dayColumn } from '@/lib/reviews/review-queries'

// Tells the learner their Daily Challenge result is ready, in the in-app inbox (the bell),
// for a pass AND a fail. Best effort and idempotent: a failure never fails the grading, the
// (userId, logicalKey) unique key makes a replay insert nothing. In-app notifications are
// always on in this release (ADR-0009), so a past opt-out preference does not apply. No email
// here: reminder email is disabled by the release policy.

export async function notifyChallengeResult(
	userId: string,
	date: string,
	counts: { testsPassed: number; testsTotal: number }
): Promise<void> {
	try {
		const row = await db.challengeAttempt.findUnique({
			where: { userId_challengeDate: { userId, challengeDate: dayColumn(date) } },
			select: { challenge: { select: { problemSlug: true } } }
		})
		if (row == null) return
		const payload = buildChallengeResult(
			date,
			row.challenge.problemSlug,
			counts.testsPassed,
			counts.testsTotal
		)
		if (payload == null) return
		await db.learningNotification.createMany({
			data: [
				{
					userId,
					logicalKey: challengeResultKey(date),
					kind: CHALLENGE_RESULT_KIND,
					payload: payload as unknown as Prisma.InputJsonValue
				}
			],
			skipDuplicates: true
		})
	} catch (error) {
		captureError(error, { area: 'challenge-result-notification' })
	}
}
