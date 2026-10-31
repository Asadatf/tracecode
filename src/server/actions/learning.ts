'use server'

import { z } from 'zod'
import { validatedAction } from './validated-action'
import { db, Prisma } from '@/server/db/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { jsonSchema } from '@/lib/trace/contract'

// Persistence for authenticated learners. Browser-reported pass/fail is stored
// as TELEMETRY, not authoritative grading (ADR-0001). When no one is signed in,
// every action returns { persisted: false } and the UI keeps its local-only
// record — there is no second auth path and no service-role key here.

async function currentUserId(): Promise<string | null> {
	const supabase = await createServerSupabaseClient()
	const { data } = await supabase.auth.getUser()
	return data.user?.id ?? null
}

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
		tests: z.array(testResultInput)
	}),
	handler: async (input) => {
		const userId = await currentUserId()
		if (userId == null) return { persisted: false as const }

		const attempt = await db.attempt.create({
			data: {
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
		})

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
		const userId = await currentUserId()
		if (userId == null) return { persisted: false as const }
		await db.replaySession.create({
			data: {
				userId,
				attemptId: input.attemptId,
				testId: input.testId,
				testPassed: input.testPassed
			}
		})
		await db.learningEvent.create({
			data: {
				userId,
				problemSlug: input.problemSlug,
				type: 'replay_inspected',
				detail: input.testId
			}
		})
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
		const userId = await currentUserId()
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
