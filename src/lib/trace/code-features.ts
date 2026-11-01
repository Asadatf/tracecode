import { z } from 'zod'

// M7.1 — the structural fingerprint of a learner's Python source
// (specs/features/learning-recommendations.md, ADR-0003). Produced in the
// browser by the worker's `ast` message (ast-program.ts), which only PARSES the
// source; nothing here, or on the server, ever executes learner code.
//
// Facts only: counts, booleans and an allow-listed set of builtin names. No raw
// identifiers or literals, so a persisted value cannot carry what the learner
// typed. Nothing in it asserts correctness, complexity or mastery — M7.2 keeps
// these observations apart from inferred learning gaps.

export const CODE_FEATURES_VERSION = 1

export const FEATURE_LIMITS = {
	// A practice solution is a few dozen lines; anything larger is not analysed
	// (the request is answered with an analysis_error rather than parsed).
	maxSourceChars: 20_000,
	// Ceiling for every count. Real values sit far below it given the source
	// cap; it exists so the persisted JSON is bounded by construction.
	maxCount: 100_000
} as const

// How long the main thread waits for a parse before recycling the worker.
export const AST_TIMEOUT_MS = 2000

// Builtins a call can be reported for. Fixed and sorted, so `builtinCalls` is
// bounded (≤ the length of this list) and deterministic. The worker is handed
// this list, so there is a single source of truth.
export const BUILTIN_CALL_ALLOWLIST = [
	'abs',
	'all',
	'any',
	'dict',
	'enumerate',
	'len',
	'list',
	'map',
	'max',
	'min',
	'range',
	'reversed',
	'set',
	'sorted',
	'sum',
	'zip'
] as const
export type BuiltinCall = (typeof BUILTIN_CALL_ALLOWLIST)[number]

const count = z.number().int().min(0).max(FEATURE_LIMITS.maxCount)

// Strictly ascending (sorted, no duplicates), so equal content always serialises
// identically — the property the M7.3 evidence hash relies on.
const builtinCallsSchema = z
	.array(z.enum(BUILTIN_CALL_ALLOWLIST))
	.max(BUILTIN_CALL_ALLOWLIST.length)
	.refine((calls) => calls.every((call, i) => i === 0 || (calls[i - 1] ?? '') < call), {
		message: 'builtinCalls must be sorted and unique'
	})

// `.strict()`: an unknown key is rejected, never stored.
export const codeFeaturesSchema = z
	.object({
		v: z.literal(CODE_FEATURES_VERSION),
		loops: z
			.object({
				// ast.For / ast.AsyncFor and ast.While statements.
				for: count,
				while: count,
				// Deepest lexical nesting of those statements (0 = no loop).
				maxDepth: count
			})
			.strict(),
		// List/set/dict comprehensions and generator expressions.
		comprehensions: count,
		// ast.If nodes; an `elif` is an If, so it counts.
		branches: count,
		returns: count,
		// Function definitions (sync and async), including nested ones.
		defs: count,
		// A call, by name, to an enclosing function: direct self-recursion.
		recursion: z.boolean(),
		// A dict literal/comprehension or a dict/defaultdict/Counter/OrderedDict call.
		usesDict: z.boolean(),
		// A set literal/comprehension or a set/frozenset call.
		usesSet: z.boolean(),
		// A sorted(...) call or a `.sort()` method call.
		usesSorted: z.boolean(),
		builtinCalls: builtinCallsSchema,
		// Every AST node visited: a size proxy, NOT a complexity claim.
		nodeCount: count,
		// Physical source lines (a trailing newline adds none; empty source is 0).
		lineCount: count
	})
	.strict()
export type CodeFeatures = z.infer<typeof codeFeaturesSchema>

// Request/response of the worker's `ast` message. A source that does not parse,
// or cannot be analysed, is a VALIDATED outcome, never a throw: the caller just
// persists no features for it.
export const astRequestSchema = z.object({ code: z.string() })
export type AstRequest = z.infer<typeof astRequestSchema>

export const astSyntaxErrorSchema = z.object({
	message: z.string(),
	line: z.number().int(),
	column: z.number().int()
})

export const astResultSchema = z.discriminatedUnion('status', [
	z.object({ status: z.literal('ok'), features: codeFeaturesSchema }),
	z.object({ status: z.literal('syntax_error'), syntaxError: astSyntaxErrorSchema }),
	// Too large, parser limit hit (e.g. nesting depth), timeout, or worker failure.
	// `permanent` says retrying the SAME source can never succeed (too large, parser
	// limit), as opposed to a timeout or a dead worker, which is worth retrying.
	z.object({
		status: z.literal('analysis_error'),
		message: z.string().max(200),
		permanent: z.boolean().default(false)
	})
])
export type AstResult = z.infer<typeof astResultSchema>

export function analysisError(message: string, permanent = false): AstResult {
	return { status: 'analysis_error', message: message.slice(0, 200), permanent }
}

// What `attempts.codeFeatures` holds for an attempt whose source can never be
// analysed (it does not parse, or exceeds the limits). Stored in the same column
// so the backfill does not re-list, re-download and re-parse it in every session
// and cannot be starved by a pile of such attempts. It carries no features:
// parseStoredCodeFeatures reads it as null, exactly like an un-analysed attempt.
export const unanalyzableMarkerSchema = z
	.object({
		v: z.literal(CODE_FEATURES_VERSION),
		unanalyzable: z.enum(['syntax_error', 'not_analyzable'])
	})
	.strict()
export type UnanalyzableMarker = z.infer<typeof unanalyzableMarkerSchema>

// Everything the column may hold.
export const storedCodeFeaturesSchema = z.union([codeFeaturesSchema, unanalyzableMarkerSchema])

// The marker to persist for an ast outcome, or null when the outcome is not
// final (success, or a timeout / dead worker that a later session may retry).
export function markerFromAstResult(result: AstResult): UnanalyzableMarker | null {
	if (result.status === 'syntax_error') {
		return { v: CODE_FEATURES_VERSION, unanalyzable: 'syntax_error' }
	}
	if (result.status === 'analysis_error' && result.permanent) {
		return { v: CODE_FEATURES_VERSION, unanalyzable: 'not_analyzable' }
	}
	return null
}

// The features to store with a new attempt, from whatever the browser sent.
// Features are an optional extra: a value that fails validation is DROPPED (and
// reported), never allowed to reject the attempt it arrived with.
export function featuresForWrite(value: unknown): {
	features: CodeFeatures | null
	discarded: boolean
} {
	if (value === undefined) return { features: null, discarded: false }
	const features = parseStoredCodeFeatures(value)
	return { features, discarded: features == null }
}

// The features to persist for an ast outcome, or null when there are none.
export function featuresFromAstResult(result: AstResult): CodeFeatures | null {
	return result.status === 'ok' ? result.features : null
}

// Reads a stored `attempts.codeFeatures` value. Null-tolerant by design: a
// pre-M7 attempt (null), an unknown future version or a corrupt value all read
// as "no features", never as an error, so the recommendation engine can treat
// every attempt uniformly.
export function parseStoredCodeFeatures(value: unknown): CodeFeatures | null {
	const parsed = codeFeaturesSchema.safeParse(value)
	return parsed.success ? parsed.data : null
}
