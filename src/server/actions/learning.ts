'use server'

import { z } from 'zod'
import { validatedAction } from './validated-action'
import { db, Prisma } from '@/server/db/client'
import { currentLearnerId, currentUserIdSafe } from '@/server/auth/session'
import { assertOwnedBy } from '@/lib/auth/ownership'
import { jsonSchema } from '@/lib/trace/contract'
import { linkedReplayWrites } from '@/lib/learning/replay-writes'
import {
	BACKFILL_MAX_BATCH,
	backfillCandidateQuery,
	setFeaturesIfMissingQuery
} from '@/lib/learning/code-feature-queries'
import { featuresForWrite, storedCodeFeaturesSchema } from '@/lib/trace/code-features'
import { captureError } from '@/lib/observability/capture-error'
import { isMissingColumnError } from '@/lib/learning/missing-column'

// Persistence for authenticated learners. Browser-reported pass/fail is stored
// as TELEMETRY, not authoritative grading (ADR-0001). When no one is signed in,
// every action returns { persisted: false } and the UI keeps its local-only
// record — there is no second auth path and no service-role key here.

function jsonIn(value: unknown): Prisma.InputJsonValue {
	return value as Prisma.InputJsonValue
}

const testResultInput = z.object({
	testId: z.string(),
	passed: z.boolean(),
	expected: jsonSchema,
	actual: jsonSchema.optional(),
	errorType: z.string().optional(),
	errorMessage: z.string().optional()
})

export const saveAttempt = validatedAction({
	input: z.object({
		problemSlug: z.string(),
		source: z.string(),
		status: z.string(),
		testsPassed: z.number().int().nonnegative(),
		testsTotal: z.number().int().nonnegative(),
		allPassed: z.boolean(),
		// M7.1: parsed in the browser by the worker's `ast` message. Optional —
		// absent when the source did not parse or the worker was unavailable. Left
		// as `unknown` here on purpose and validated by featuresForWrite below: a
		// value that fails the strict schema is dropped, never allowed to reject
		// the attempt (and its test results) it arrived with.
		codeFeatures: z.unknown().optional(),
		tests: z.array(testResultInput)
	}),
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
		// of columns it does not set. Without features the INSERT never names
		// `codeFeatures`, so it is exactly the pre-M7 write.
		async function createAttempt(codeFeatures: typeof features) {
			return db.attempt.create({
				data: codeFeatures == null ? attemptData : { ...attemptData, codeFeatures },
				select: { id: true }
			})
		}
		let attempt: { id: string }
		try {
			attempt = await createAttempt(features)
		} catch (error) {
			// The code can be deployed a moment before the `codeFeatures` migration has
			// run. A submission is never lost over an optional extra: report it and
			// save the attempt exactly as before M7. (The nested test-result rows are
			// part of the same atomic write, so the failed first try left nothing.)
			if (features == null || !isMissingColumnError(error)) throw error
			captureError(error, { area: 'attempt-code-features-migration-pending' })
			attempt = await createAttempt(null)
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
