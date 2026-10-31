import { z } from 'zod'
import { jsonSchema, testCaseSchema, type ProblemMeta } from './contract'

// A problem definition: everything the UI shows and the engine runs, as static
// data for the demo (no DB yet — that's a later milestone). Inputs are
// POSITIONAL (args mapped onto `params` in order), so the engine never depends
// on parameter names. `arrayVar`/`pointerVars` are visualiser metadata, not
// engine input.
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
