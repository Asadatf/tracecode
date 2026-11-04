import { z } from 'zod'
import { jsonSchema, runStatusSchema } from '@/lib/trace/contract'

// The shared vocabulary between the tutor's client, its API route and its
// provider adapter. One schema per boundary so the handler is guaranteed to
// see validated inputs and the client is guaranteed to see validated outputs.

// Per-conversation UX cap (specs/features/contextual-ai-tutor.md AC6). Not a
// billing control — server rate limiting is independent.
export const MAX_QUESTIONS_PER_CONVERSATION = 15

// Bounds enforced on every request. Breaching one is a client bug; the
// schema will reject it rather than let a 50 KB prompt reach the provider.
export const LIMITS = {
	maxMessagesSent: 20,
	maxMessageChars: 2000,
	maxCodeChars: 8000,
	maxFailedTests: 3,
	maxFailedArgChars: 400,
	maxReplayLocals: 12,
	maxReplayLocalChars: 300
} as const

export const tutorRoleSchema = z.enum(['user', 'assistant'])
export type TutorRole = z.infer<typeof tutorRoleSchema>

export const tutorMessageSchema = z.object({
	id: z.string().min(1).max(64),
	role: tutorRoleSchema,
	text: z.string().min(1).max(LIMITS.maxMessageChars),
	createdAt: z.string().optional()
})
export type TutorMessage = z.infer<typeof tutorMessageSchema>

// A failed test, trimmed to what the tutor can act on without rebuilding a
// trace it never had. `expected` and `actual` are Python-readable strings
// (formatValue()'d client-side) so the prompt renders `True` / `[0, 2]`
// rather than the engine's `{kind:'bool', value:true}` wire shape. `actual`
// and `error` are optional because a syntax error has neither.
export const failedTestSchema = z.object({
	id: z.string().min(1).max(64),
	args: z.array(jsonSchema).max(8),
	expected: z.string().max(LIMITS.maxFailedArgChars),
	actual: z.string().max(LIMITS.maxFailedArgChars).optional(),
	error: z.object({ type: z.string().max(80), message: z.string().max(400) }).optional()
})

export const replayStepSchema = z.object({
	line: z.number().int().positive(),
	locals: z.record(z.string().max(80), z.string().max(LIMITS.maxReplayLocalChars)),
	changed: z.array(z.string().max(80)).max(16).optional(),
	sourceLine: z.string().max(400).optional()
})

export const tutorContextSchema = z.object({
	code: z.string().max(LIMITS.maxCodeChars).optional(),
	// The latest grading summary. If absent, the request is treated as
	// "learner has not run tests yet" — never as "no failures".
	runSummary: z
		.object({
			status: runStatusSchema,
			passed: z.number().int().nonnegative(),
			total: z.number().int().nonnegative()
		})
		.optional(),
	failedTests: z.array(failedTestSchema).max(LIMITS.maxFailedTests).optional(),
	replay: replayStepSchema.optional(),
	hintLevel: z.number().int().min(0).max(3).optional(),
	stale: z.boolean().optional() // the code has changed since the last run
})
export type TutorContext = z.infer<typeof tutorContextSchema>

export const tutorRequestSchema = z.object({
	problemSlug: z.string().min(1).max(80),
	conversationId: z.string().min(1).max(64),
	messages: z.array(tutorMessageSchema).min(1).max(LIMITS.maxMessagesSent),
	context: tutorContextSchema
})
export type TutorRequest = z.infer<typeof tutorRequestSchema>

export type TutorFailureReason =
	'rate_limited' | 'unavailable' | 'invalid' | 'timeout' | 'network' | 'empty'

export type TutorResponse =
	{ ok: true; reply: string } | { ok: false; reason: TutorFailureReason; message: string }
