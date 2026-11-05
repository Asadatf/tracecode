import type { ProblemDefinition } from './problem'

// Which Practice test results are shown one by one, and which are summarised. Every test still
// runs and still decides pass/fail (this only changes how results are PRESENTED): the small
// teaching set a problem names in `visibleTestIds` is listed individually, and the remaining
// validation checks (edge cases, larger inputs, performance) are summarised. A failing
// validation check is never hidden: it is always listed with the failures.

export interface ResultSplit<T> {
	visible: T[]
	checks: T[]
	failedChecks: T[]
	passedChecks: T[]
}

export function visibleTestIds(
	problem: Pick<ProblemDefinition, 'tests' | 'visibleTestIds'>
): ReadonlySet<string> {
	return new Set(problem.visibleTestIds ?? problem.tests.map((test) => test.id))
}

export function splitResults<T extends { testId: string; passed: boolean }>(
	problem: Pick<ProblemDefinition, 'tests' | 'visibleTestIds'>,
	results: readonly T[]
): ResultSplit<T> {
	const shown = visibleTestIds(problem)
	const visible = results.filter((result) => shown.has(result.testId))
	const checks = results.filter((result) => !shown.has(result.testId))
	return {
		visible,
		checks,
		failedChecks: checks.filter((result) => !result.passed),
		passedChecks: checks.filter((result) => result.passed)
	}
}
