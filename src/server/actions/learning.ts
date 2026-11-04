'use server'

import { z } from 'zod'
import { validatedAction } from './validated-action'
import { db, Prisma } from '@/server/db/client'
import { currentLearnerId, currentUserIdSafe } from '@/server/auth/session'
import { assertOwnedBy } from '@/lib/auth/ownership'
import { saveAttemptInput } from '@/lib/learning/save-attempt-input'
import { isMeaningfulAttempt } from '@/lib/streak/attempt-meaning'
import { reviewEvidenceHolds } from '@/lib/reviews/review-evidence'
import { trackReviewPass } from '@/server/reviews/reviews'
import { PROBLEMS } from '@/lib/trace/problems'
import { linkedReplayWrites } from '@/lib/learning/replay-writes'
import {
	BACKFILL_MAX_BATCH,
	backfillCandidateQuery,
	setFeaturesIfMissingQuery
} from '@/lib/learning/code-feature-queries'
import { featuresForWrite, storedCodeFeaturesSchema } from '@/lib/trace/code-features'
import { captureError } from '@/lib/observability/capture-error'
import { writeWithOptionalColumns } from '@/lib/learning/optional-columns'

// Persistence for authenticated learners. Browser-reported pass/fail is stored
// as TELEMETRY, not authoritative grading (ADR-0001). When no one is signed in,
// every action returns { persisted: false } and the UI keeps its local-only
// record — there is no second auth path and no service-role key here.

function jsonIn(value: unknown): Prisma.InputJsonValue {
	return value as Prisma.InputJsonValue
}

export const saveAttempt = validatedAction({
	input: saveAttemptInput,
	handler: async (input) => {
		const userId = await currentLearnerId()
		if (userId == null) return { persisted: false as const }

		const { features, discarded } = featuresForWrite(input.codeFeatures)
		if (discarded) {
			captureError(new Error('saveAttempt discarded invalid codeFeatures'), {
				area: 'attempt-code-features'
			})
		}

		const attemptData = {
			userId,
			problemSlug: input.problemSlug,
			source: input.source,
			status: input.status,
			testsPassed: input.testsPassed,
			testsTotal: input.testsTotal,
			allPassed: input.allPassed,
			testResults: {
				create: input.tests.map((t) => ({
					testId: t.testId,
					passed: t.passed,
					expected: jsonIn(t.expected),
					actual: t.actual === undefined ? Prisma.DbNull : jsonIn(t.actual),
					errorType: t.errorType ?? null,
					errorMessage: t.errorMessage ?? null
				}))
			}
		}
		// Only the id is used; not reading the row back keeps this write independent
		// of columns it does not set. `meaningful` is the server's own verdict (never
		// the browser's) and feeds the streak only; the attempt is saved either way,
		// because starter-only runs are still honest evidence for recommendations.
		// Either optional column may land after this code: on PostgreSQL's
		// undefined-column error for exactly that column it is dropped and the write
		// retried (nested test-result rows are one atomic write, so a failed try left
		// nothing); any other error propagates. A submission is never lost over an
		// optional extra.
		const meaningful = isMeaningfulAttempt(input.problemSlug, input.source)
		const attempt = await writeWithOptionalColumns(
			{
				meaningful,
				...(features == null ? {} : { codeFeatures: features })
			},
			(extras) =>
				db.attempt.create({
					data: { ...attemptData, ...extras },
					select: { id: true, createdAt: true }
				}),
			(column, error) => captureError(error, { area: `attempt-${column}-migration-pending` })
		)

		// Spaced review (M9C): a pass the server finds consistent starts, or — once due —
		// completes, this problem's review cycle. Never fails the submission.
		const problem = Object.hasOwn(PROBLEMS, input.problemSlug)
			? PROBLEMS[input.problemSlug]
			: undefined
		if (problem != null && reviewEvidenceHolds(problem, input, meaningful)) {
			await trackReviewPass(userId, input.problemSlug, attempt.createdAt)
		}

		const existing = await db.problemProgress.findUnique({
			where: { userId_problemSlug: { userId, problemSlug: input.problemSlug } }
		})
		const now = new Date()
		await db.problemProgress.upsert({
			where: { userId_problemSlug: { userId, problemSlug: input.problemSlug } },
			create: {
				userId,
				problemSlug: input.problemSlug,
				status: input.allPassed ? 'solved' : 'attempted',
				attempts: 1,
				bestTestsPassed: input.testsPassed,
				testsTotal: input.testsTotal,
				firstSolvedAt: input.allPassed ? now : null,
				latestSolvedAt: input.allPassed ? now : null
			},
			update: {
				status: input.allPassed ? 'solved' : (existing?.status ?? 'attempted'),
				attempts: { increment: 1 },
				bestTestsPassed: Math.max(existing?.bestTestsPassed ?? 0, input.testsPassed),
				testsTotal: input.testsTotal,
				firstSolvedAt: existing?.firstSolvedAt ?? (input.allPassed ? now : null),
				latestSolvedAt: input.allPassed ? now : (existing?.latestSolvedAt ?? null)
			}
		})

		return { persisted: true as const, attemptId: attempt.id }
	}
})

export const recordReplaySession = validatedAction({
	input: z.object({
		attemptId: z.string().uuid(),
		problemSlug: z.string(),
		testId: z.string(),
		testPassed: z.boolean()
	}),
	handler: async (input) => {
		const userId = await currentLearnerId()
		if (userId == null) return { persisted: false as const }
		// attemptId is browser-supplied: it must name one of THIS learner's attempts.
		const attempt = await db.attempt.findUnique({
			where: { id: input.attemptId },
			select: { userId: true }
		})
		assertOwnedBy(attempt?.userId, userId)
		const writes = linkedReplayWrites(input)
		await db.replaySession.create({ data: { userId, ...writes.session } })
		await db.learningEvent.create({ data: { userId, ...writes.event } })
		return { persisted: true as const }
	}
})

export const recordLearningEvent = validatedAction({
	input: z.object({
		problemSlug: z.string(),
		type: z.enum(['replay_inspected', 'hint_revealed', 'milestone_reached']),
		detail: z.string().optional()
	}),
	handler: async (input) => {
		const userId = await currentLearnerId()
		if (userId == null) return { persisted: false as const }
		await db.learningEvent.create({
			data: {
				userId,
				problemSlug: input.problemSlug,
				type: input.type,
				detail: input.detail ?? null
			}
		})
		return { persisted: true as const }
	}
})

// M7.1 backfill, step 1: the signed-in learner's own newest attempts that still
// have no features, with their source, for the browser to parse. Returns at most
// BACKFILL_MAX_BATCH rows, only for attempts that need them, and only the
// learner's own — the user id comes from the validated session, never the body.
export const listBackfillCandidates = validatedAction({
	input: z.object({ limit: z.number().int().min(1).max(BACKFILL_MAX_BATCH).optional() }),
	handler: async (input) => {
		const userId = await currentUserIdSafe()
		if (userId == null) return { items: [] }
		const rows = await db.attempt.findMany(
			backfillCandidateQuery(userId, input.limit ?? BACKFILL_MAX_BATCH, Prisma.DbNull)
		)
		return { items: rows.map((row) => ({ attemptId: row.id, source: row.source })) }
	}
})

// M7.1 backfill, step 2: store features the browser computed for one attempt.
// Idempotent and ownership-checked in a single conditional UPDATE: it writes
// only while the column is still null and only on the learner's own attempt, so
// `saved: false` means "not yours, not found, or already set" without telling a
// probe which.
export const saveCodeFeatures = validatedAction({
	// Either the features, or the marker for a source that can never be analysed.
	// Both are strict, bounded schemas; anything else is rejected.
	input: z.object({ attemptId: z.string().uuid(), codeFeatures: storedCodeFeaturesSchema }),
	handler: async (input) => {
		const userId = await currentLearnerId()
		if (userId == null) return { saved: false as const }
		const { count } = await db.attempt.updateMany(
			setFeaturesIfMissingQuery(userId, input.attemptId, input.codeFeatures, Prisma.DbNull)
		)
		return { saved: count === 1 }
	}
})
