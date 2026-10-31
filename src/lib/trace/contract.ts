import { z } from 'zod'

// The execution-trace contract: the ONLY interface between the Python engine
// (Track A — the Pyodide worker + sys.settrace tracer) and the visualiser
// (Track B — editor, results, step-through debugger). It is the Zod source of
// truth for `specs/02-trace-contract.md`; changing it needs both track owners'
// sign-off, and the spec + fixtures move with it.
//
// Hybrid model: the engine emits FACTS ONLY. It never narrates, never guesses
// intent, and never emits changed/loops/pointers — those are derived outside
// the worker by deriveView()/explain() from a Trace plus a ProblemMeta (see the
// "Derived view" section). Track B consumes only the types here and the
// runCode()/traceCode() promises — never Pyodide or the worker directly.

// ── JSON (test args / expected values travel as plain JSON) ──────────────────
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonSchema),
		z.record(z.string(), jsonSchema)
	])
)

// ── Values: a structured, bounded snapshot of a Python value ─────────────────
// Bounds (VALUE_LIMITS) are enforced by the engine when it serialises; a
// collection past its cap carries `truncated: true` so the UI can say so.
export type Value =
	| { kind: 'int'; value: number }
	| { kind: 'float'; value: number }
	| { kind: 'bool'; value: boolean }
	| { kind: 'str'; value: string }
	| { kind: 'none' }
	| { kind: 'list'; items: Value[]; truncated?: boolean }
	| { kind: 'tuple'; items: Value[]; truncated?: boolean }
	| { kind: 'dict'; entries: [Value, Value][]; truncated?: boolean }
	| { kind: 'other'; repr: string }

export const valueSchema: z.ZodType<Value> = z.lazy(() =>
	z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('int'), value: z.number() }),
		z.object({ kind: z.literal('float'), value: z.number() }),
		z.object({ kind: z.literal('bool'), value: z.boolean() }),
		z.object({ kind: z.literal('str'), value: z.string() }),
		z.object({ kind: z.literal('none') }),
		z.object({
			kind: z.literal('list'),
			items: z.array(valueSchema),
			truncated: z.boolean().optional()
		}),
		z.object({
			kind: z.literal('tuple'),
			items: z.array(valueSchema),
			truncated: z.boolean().optional()
		}),
		z.object({
			kind: z.literal('dict'),
			entries: z.array(z.tuple([valueSchema, valueSchema])),
			truncated: z.boolean().optional()
		}),
		z.object({ kind: z.literal('other'), repr: z.string() })
	])
)

// ── Trace: one execution of one input, step by step (facts only) ─────────────
export const stepEventSchema = z.enum(['call', 'line', 'return', 'exception'])
export type StepEvent = z.infer<typeof stepEventSchema>

export const exceptionSchema = z.object({ type: z.string(), message: z.string() })

export const stepSchema = z.object({
	index: z.number().int().nonnegative(),
	event: stepEventSchema,
	line: z.number().int().positive(),
	func: z.string(),
	// Learner frames only; harness/Pyodide/stdlib frames are never emitted, and
	// depth counts learner frames only (0 = the entry function).
	depth: z.number().int().nonnegative(),
	locals: z.record(z.string(), valueSchema),
	returnValue: valueSchema.optional(),
	exception: exceptionSchema.optional()
})
export type Step = z.infer<typeof stepSchema>

export const traceSchema = z.object({
	source: z.array(z.string()),
	steps: z.array(stepSchema),
	truncated: z.boolean()
})
export type Trace = z.infer<typeof traceSchema>

// ── Shared outcome vocabulary ────────────────────────────────────────────────
export const runStatusSchema = z.enum(['completed', 'syntax_error', 'timeout', 'engine_error'])
export type RunStatus = z.infer<typeof runStatusSchema>

export const syntaxErrorSchema = z.object({
	message: z.string(),
	line: z.number().int(),
	column: z.number().int()
})

// A Python error raised while a traced input ran, pinned to the raising line.
export const runtimeErrorSchema = z.object({
	type: z.string(),
	message: z.string(),
	line: z.number().int()
})

// Compile succeeded but the run could not proceed (e.g. the entry function was
// not defined), or the engine itself failed.
export const topErrorSchema = z.object({
	type: z.enum(['entry_not_found', 'engine']),
	message: z.string()
})

// One test case: positional args mapped onto the entry function's parameters in
// order (never by name — the engine stays name-agnostic). `expected` is plain
// JSON; the engine compares the real return value against it.
export const testCaseSchema = z.object({
	id: z.string(),
	args: z.array(jsonSchema),
	expected: jsonSchema
})
export type TestCase = z.infer<typeof testCaseSchema>

// ── Phase 1: `run` — all tests, UNTRACED, for the score ──────────────────────
export const runRequestSchema = z.object({
	code: z.string(),
	entry: z.string(),
	tests: z.array(testCaseSchema),
	limits: z.object({ timeoutMs: z.number().int().positive() })
})
export type RunRequest = z.infer<typeof runRequestSchema>

export const testResultSchema = z.object({
	testId: z.string(),
	passed: z.boolean(),
	actual: valueSchema.optional(),
	expected: valueSchema,
	error: runtimeErrorSchema.optional()
})
export type TestResult = z.infer<typeof testResultSchema>

export const runResultSchema = z.object({
	status: runStatusSchema,
	syntaxError: syntaxErrorSchema.optional(),
	error: topErrorSchema.optional(),
	tests: z.array(testResultSchema)
})
export type RunResult = z.infer<typeof runResultSchema>

// ── Phase 2: `trace` — ONE input, traced, on demand ──────────────────────────
// Self-contained (carries its own code + input) so a replay can only ever show
// the exact source snapshot that was scored, never a newer edit.
export const traceRequestSchema = z.object({
	code: z.string(),
	entry: z.string(),
	input: z.object({ args: z.array(jsonSchema) }),
	limits: z.object({
		maxSteps: z.number().int().positive(),
		timeoutMs: z.number().int().positive()
	})
})
export type TraceRequest = z.infer<typeof traceRequestSchema>

export const traceResultSchema = z.object({
	status: runStatusSchema,
	syntaxError: syntaxErrorSchema.optional(),
	actual: valueSchema.optional(),
	error: runtimeErrorSchema.optional(),
	trace: traceSchema.optional()
})
export type TraceResult = z.infer<typeof traceResultSchema>

// ── Worker protocol ──────────────────────────────────────────────────────────
// Pyodide download/init is reported as `loading_runtime` and is bounded by a
// separate initTimeoutMs, NOT the execution timeout; execution time is measured
// only from `running`.
export const workerRequestSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('run'), request: runRequestSchema }),
	z.object({ type: z.literal('trace'), request: traceRequestSchema })
])
export type WorkerRequest = z.infer<typeof workerRequestSchema>

export const workerResponseSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('status'), phase: z.enum(['loading_runtime', 'running']) }),
	z.object({ type: z.literal('run_result'), result: runResultSchema }),
	z.object({ type: z.literal('trace_result'), result: traceResultSchema })
])
export type WorkerResponse = z.infer<typeof workerResponseSchema>

// ── Derived view (OUTSIDE the engine; Track-B facing) ────────────────────────
// Produced by deriveView(trace, meta): one StepView per Step.index. A pointer
// or loop appears only when the trace data and the problem metadata support it.
export const pointerSchema = z.object({
	name: z.string(),
	list: z.string(),
	index: z.number().int()
})
export type Pointer = z.infer<typeof pointerSchema>

export const loopStateSchema = z.object({
	line: z.number().int().positive(),
	variable: z.string().optional(),
	iteration: z.number().int().positive()
})
export type LoopState = z.infer<typeof loopStateSchema>

export const stepViewSchema = z.object({
	changed: z.array(z.string()),
	loops: z.array(loopStateSchema),
	pointers: z.array(pointerSchema)
})
export type StepView = z.infer<typeof stepViewSchema>

// Metadata the derivation layer needs: the entry signature (ordered params),
// which int/list locals form pointers, and the primary array to draw against.
// Deliberately no hardcoded `nums`/`i`/`j` anywhere.
export const problemMetaSchema = z.object({
	entry: z.string(),
	params: z.array(z.object({ name: z.string() })),
	pointerVars: z.array(z.tuple([z.string(), z.string()])).optional(),
	arrayVar: z.string().optional()
})
export type ProblemMeta = z.infer<typeof problemMetaSchema>

// ── Defaults (shared by the engine and its tests) ────────────────────────────
export const DEFAULT_LIMITS = {
	maxSteps: 2000,
	timeoutMs: 3000,
	initTimeoutMs: 30_000
} as const

export const VALUE_LIMITS = {
	maxItems: 50,
	maxEntries: 50,
	maxStringLength: 200,
	maxReprLength: 200
} as const
