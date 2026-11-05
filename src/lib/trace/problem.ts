import { z } from 'zod'
import { jsonSchema, testCaseSchema, type ProblemMeta } from './contract'

// A problem definition: everything the UI shows and the engine runs, as static
// data for the demo (no DB yet — that's a later milestone). Inputs are
// POSITIONAL (args mapped onto `params` in order), so the engine never depends
// on parameter names. `arrayVar`/`pointerVars` are visualiser metadata, not
// engine input.
const hintLadderSchema = z.tuple([z.string(), z.string(), z.string()])

// How a test is judged. Default `return`: the entry's return value must equal
// `expected`. `mutate-arg`: an in-place problem (returns nothing) — the argument
// at `argIndex`, after the call, must equal `expected` (see grading.ts). The
// engine and the run contract are identical either way.
export const gradingSchema = z.discriminatedUnion('mode', [
	z.object({ mode: z.literal('return') }),
	z.object({ mode: z.literal('mutate-arg'), argIndex: z.number().int().nonnegative() })
])
export type Grading = z.infer<typeof gradingSchema>

// The optional, post-solve exercise. Offered only once every official test has
// passed; it never claims the learner's solution is slow — `goal` names an
// avoidable cost as a question, and the hints are an observation → reasoning →
// strategy ladder that never contains a full solution.
export const optimizationSchema = z.object({
	title: z.string(),
	goal: z.string(),
	hints: hintLadderSchema
})
export type Optimization = z.infer<typeof optimizationSchema>

export const problemDefinitionSchema = z.object({
	slug: z.string(),
	title: z.string(),
	// The Python function the tests call.
	entry: z.string(),
	// Ordered parameters; test `args` line up with these positionally.
	params: z.array(z.object({ name: z.string() })).min(1),
	difficulty: z.enum(['easy', 'medium', 'hard']),
	conceptTags: z.array(z.string()),
	// Statement paragraphs, in order.
	statement: z.array(z.string()).min(1),
	examples: z.array(z.object({ args: z.array(jsonSchema), output: jsonSchema })),
	starter: z.string(),
	tests: z.array(testCaseSchema).min(1),
	// The small teaching set shown as individual results in Practice (5–6 distinct, meaningful
	// cases). Every test in `tests` still runs and still decides pass/fail; the rest are
	// validation checks (edge cases, larger inputs, performance) summarised in the results.
	// Absent means every test is shown.
	visibleTestIds: z.array(z.string()).optional(),
	// Judging mode; absent means `return`.
	grading: gradingSchema.optional(),
	// Observation → reasoning → strategy hints about the specification, shown as
	// a last resort for a failure no evidence-based rule diagnosed (teach.ts).
	correctnessHints: hintLadderSchema.optional(),
	// Stage B: the optional post-solve optimization challenge.
	optimization: optimizationSchema.optional(),
	// Primary array local to draw pointers against (optional).
	arrayVar: z.string().optional(),
	// [intLocal, listLocal] pairs the visualiser may render as pointers (optional).
	pointerVars: z.array(z.tuple([z.string(), z.string()])).optional(),
	// Preserved from the prototype for the later Optimize milestone; unused for now.
	knownStrategies: z
		.array(z.object({ name: z.string(), time: z.string(), space: z.string() }))
		.optional()
})
export type ProblemDefinition = z.infer<typeof problemDefinitionSchema>

// The subset the derivation layer (deriveView/explain) needs. Pure projection —
// no engine or Pyodide involvement.
export function problemMeta(problem: ProblemDefinition): ProblemMeta {
	return {
		entry: problem.entry,
		params: problem.params,
		pointerVars: problem.pointerVars,
		arrayVar: problem.arrayVar
	}
}
