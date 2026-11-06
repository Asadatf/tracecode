import { z } from 'zod'
import { jsonSchema } from '../trace/contract'
import { gradingSchema, type ProblemDefinition } from '../trace/problem'

// The format of a private Daily Exam problem pack (specs/features/daily-exam.md AC42, ADR-0011,
// ADR-0012). Pack FILES live only under the git-ignored `private/exam-pool/` and never in the
// repository, which is public. This module holds only the schema and the pure checks, never
// any problem content.

const caseSchema = z
	.object({ id: z.string().min(1).max(40), args: z.array(jsonSchema), expected: jsonSchema })
	.strict()

const solutionSchema = z
	.object({ name: z.string().min(1).max(60), source: z.string().min(1).max(8000) })
	.strict()

export const packProblemSchema = z
	.object({
		slug: z
			.string()
			.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
			.max(60),
		title: z.string().min(3).max(80),
		entry: z.string().regex(/^[a-z_][a-z0-9_]*$/),
		params: z.array(z.object({ name: z.string().regex(/^[a-z_][a-z0-9_]*$/) }).strict()).min(1),
		difficulty: z.enum(['easy', 'medium', 'hard']),
		conceptTags: z.array(z.string().min(1)).min(1).max(5),
		statement: z.array(z.string().min(10)).min(1).max(8),
		examples: z
			.array(z.object({ args: z.array(jsonSchema), output: jsonSchema }).strict())
			.min(1)
			.max(4),
		starter: z.string().min(10).max(2000),
		grading: gradingSchema.optional(),
		// Public after first publication (Practice); never the hidden suite.
		practiceTests: z.array(caseSchema).min(4).max(40),
		// SERVER-ONLY. Used to grade the exam.
		hiddenCases: z.array(caseSchema).min(10).max(40),
		// SERVER-ONLY. Every one must pass every hidden case.
		referenceSolutions: z.array(solutionSchema).min(1).max(4),
		// Deliberately wrong (incomplete, off-by-one, brute force that times out...). Every one must
		// FAIL at least one hidden case, proving the suite discriminates. Never stored.
		wrongSolutions: z.array(solutionSchema).min(2).max(8)
	})
	.strict()

export type PackProblem = z.infer<typeof packProblemSchema>

// The issues found in a whole pack, as codes with an index (never content), so the loader can
// report them without printing anything secret.
export interface PackIssue {
	problem: number
	code: string
}

const canonical = (value: unknown) => JSON.stringify(value)

export function checkPack(
	problems: readonly PackProblem[],
	reservedSlugs: ReadonlySet<string>
): PackIssue[] {
	const issues: PackIssue[] = []
	const slugs = new Map<string, number>()
	problems.forEach((p, i) => {
		const add = (code: string) => issues.push({ problem: i, code })
		if (slugs.has(p.slug)) add('duplicate_slug')
		slugs.set(p.slug, i)
		// A pool problem must never be (or shadow) a public catalogue problem.
		if (reservedSlugs.has(p.slug)) add('slug_is_public_catalogue_problem')
		if (p.params.length === 0) add('no_params')
		for (const set of [p.practiceTests, p.hiddenCases, p.examples.map((e) => ({ args: e.args }))])
			for (const c of set) if (c.args.length !== p.params.length) add('arity_mismatch')
		const ids = (cs: readonly { id: string }[]) => new Set(cs.map((c) => c.id))
		if (ids(p.practiceTests).size !== p.practiceTests.length) add('duplicate_practice_id')
		if (ids(p.hiddenCases).size !== p.hiddenCases.length) add('duplicate_hidden_id')
		// The public practice set and the public examples share no input with the hidden suite.
		const hiddenInputs = new Set(p.hiddenCases.map((c) => canonical(c.args)))
		if (p.practiceTests.some((c) => hiddenInputs.has(canonical(c.args))))
			add('practice_overlaps_hidden')
		if (p.examples.some((e) => hiddenInputs.has(canonical(e.args)))) add('example_overlaps_hidden')
		// Examples must agree with the practice set where they coincide.
		for (const e of p.examples) {
			const same = p.practiceTests.find((c) => canonical(c.args) === canonical(e.args))
			if (same != null && canonical(same.expected) !== canonical(e.output)) add('example_disagrees')
		}
		if (!new RegExp(`def\\s+${p.entry}\\s*\\(`).test(p.starter)) add('starter_lacks_entry')
		for (const s of [...p.referenceSolutions, ...p.wrongSolutions])
			if (!new RegExp(`def\\s+${p.entry}\\s*\\(`).test(s.source)) add('solution_lacks_entry')
	})
	return issues
}

// The problem as the existing runner and Sandbox grader expect it. `tests` are the PUBLIC
// practice cases (what Practice runs after publication); the hidden suite is passed to the
// grader separately and never becomes part of a ProblemDefinition.
export function toProblemDefinition(p: PackProblem): ProblemDefinition {
	return {
		slug: p.slug,
		title: p.title,
		entry: p.entry,
		params: p.params,
		difficulty: p.difficulty,
		conceptTags: p.conceptTags,
		statement: p.statement,
		examples: p.examples,
		starter: p.starter,
		tests: p.practiceTests,
		...(p.grading == null ? {} : { grading: p.grading })
	}
}
