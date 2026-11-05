import { z } from 'zod'

// The in-app notification that a Daily Challenge result is ready. One small, versioned,
// enum-and-number payload, rendered into words at display time. It states the verified test
// counts and nothing else: no score, no rank, no judgement about the learner.

export const CHALLENGE_RESULT_KIND = 'challenge_result'
export const CHALLENGE_RESULT_VERSION = 1 as const

// Unique per learner per challenge date, so a replayed or concurrent grading inserts it at
// most once (the same ON CONFLICT DO NOTHING mechanism the reminders use).
export function challengeResultKey(date: string): string {
	return `challenge:${date}`
}

export const challengeResultSchema = z
	.object({
		v: z.literal(CHALLENGE_RESULT_VERSION),
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		problemSlug: z.string().min(1).max(100),
		testsPassed: z.number().int().min(0).max(100_000),
		testsTotal: z.number().int().min(1).max(100_000)
	})
	.strict()
export type ChallengeResult = z.infer<typeof challengeResultSchema>

export function buildChallengeResult(
	date: string,
	problemSlug: string,
	testsPassed: number,
	testsTotal: number
): ChallengeResult | null {
	const candidate = { v: CHALLENGE_RESULT_VERSION, date, problemSlug, testsPassed, testsTotal }
	const parsed = challengeResultSchema.safeParse(candidate)
	return parsed.success && parsed.data.testsPassed <= parsed.data.testsTotal ? parsed.data : null
}

export function parseChallengeResult(value: unknown): ChallengeResult | null {
	const parsed = challengeResultSchema.safeParse(value)
	return parsed.success ? parsed.data : null
}

export interface ChallengeResultCopy {
	title: string
	body: string
	concept: string | null
	cta: string
	href: string
}

export function challengeResultCopy(
	result: ChallengeResult,
	titles: Readonly<Record<string, string | undefined>>
): ChallengeResultCopy {
	const name = titles[result.problemSlug] ?? 'Today’s problem'
	const complete = result.testsPassed === result.testsTotal
	return {
		title: 'Your daily challenge result is ready',
		body: `${name}: ${result.testsPassed} of ${result.testsTotal} tests passed${complete ? ' — challenge complete.' : '.'}`,
		concept: null,
		cta: 'See your result',
		href: `/challenge/${result.date}`
	}
}
