import { z } from 'zod'
import { jsonSchema } from '../trace/contract'

// The browser's saveAttempt payload. Deliberately has no field for "this counts
// for the streak": that is decided on the server from `problemSlug` + `source`
// (src/lib/streak/attempt-meaning.ts). Zod strips unknown keys, so a forged
// `meaningful` in the request never reaches the handler.
const testResultInput = z.object({
	testId: z.string(),
	passed: z.boolean(),
	expected: jsonSchema,
	actual: jsonSchema.optional(),
	errorType: z.string().optional(),
	errorMessage: z.string().optional()
})

export const saveAttemptInput = z.object({
	problemSlug: z.string(),
	source: z.string(),
	status: z.string(),
	testsPassed: z.number().int().nonnegative(),
	testsTotal: z.number().int().nonnegative(),
	allPassed: z.boolean(),
	// M7.1: parsed in the browser by the worker's `ast` message. Optional —
	// absent when the source did not parse or the worker was unavailable. Left
	// as `unknown` here on purpose and validated by featuresForWrite: a value that
	// fails the strict schema is dropped, never allowed to reject the attempt (and
	// its test results) it arrived with.
	codeFeatures: z.unknown().optional(),
	tests: z.array(testResultInput)
})
