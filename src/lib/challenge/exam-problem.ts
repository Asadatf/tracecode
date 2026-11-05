import { buildRunRequest } from '../trace/grading'
import type { RunRequest } from '../trace/contract'
import type { ProblemDefinition } from '../trace/problem'

// What the exam page may know about a problem (specs/features/daily-challenge.md): the
// statement, the PUBLIC examples and the starter, plus what the browser's local Run needs
// to execute an example. It deliberately has no `tests` field — the practice tests and
// the hidden grading suite never travel with it — and no hints, solutions or topics.
export type ExamProblem = Pick<
	ProblemDefinition,
	| 'slug'
	| 'title'
	| 'entry'
	| 'params'
	| 'difficulty'
	| 'statement'
	| 'examples'
	| 'starter'
	| 'grading'
>

export function toExamProblem(problem: ProblemDefinition): ExamProblem {
	return {
		slug: problem.slug,
		title: problem.title,
		entry: problem.entry,
		params: problem.params,
		difficulty: problem.difficulty,
		statement: problem.statement,
		examples: problem.examples,
		starter: problem.starter,
		...(problem.grading == null ? {} : { grading: problem.grading })
	}
}

export const EXAMPLE_RUN_TIMEOUT_MS = 5_000

// A local Run request over the PUBLIC examples only, built with the same harness the
// practice workspace uses. Its result is feedback for the learner and is never sent to
// the server or used for a score.
export function exampleRunRequest(problem: ExamProblem, source: string): RunRequest {
	return buildRunRequest(
		{
			...problem,
			conceptTags: [],
			tests: problem.examples.map((example, index) => ({
				id: `example-${index + 1}`,
				args: example.args,
				expected: example.output
			}))
		},
		source,
		{ timeoutMs: EXAMPLE_RUN_TIMEOUT_MS }
	)
}
