import type { ProblemDefinition } from '../trace/problem'

// Whether a saved attempt is trustworthy enough to move a review stage (specs/
// features/spaced-review.md § Trust). The pass/fail a browser reports is TELEMETRY,
// not server-verified grading (ADR-0001): the server never runs learner code. This is
// a consistency gate, not proof. It refuses a claim that is impossible rather than
// merely unproven: a completed run, judged meaningful by the SERVER (so not the
// untouched starter), whose reported results cover EVERY catalogue test exactly once,
// each marked passed, with matching totals. A partial or accidental report cannot
// advance a review. A request that fabricates complete, matching results still can
// (a known limit, closed only by server-side grading in M9B). Results' `actual`
// values are deliberately not compared: the engine judges with Python equality
// (`True == 1`), so a legitimate pass can differ from `expected` after JSON.
export interface ReportedAttempt {
	status: string
	allPassed: boolean
	testsPassed: number
	testsTotal: number
	tests: readonly { testId: string; passed: boolean }[]
}

export function reviewEvidenceHolds(
	problem: Pick<ProblemDefinition, 'tests'>,
	attempt: ReportedAttempt,
	meaningful: boolean
): boolean {
	if (!meaningful || attempt.status !== 'completed' || !attempt.allPassed) return false
	const expectedCount = problem.tests.length
	if (expectedCount === 0) return false
	if (attempt.testsTotal !== expectedCount || attempt.testsPassed !== expectedCount) return false
	if (attempt.tests.length !== expectedCount) return false
	const reported = new Map(attempt.tests.map((test) => [test.testId, test.passed]))
	if (reported.size !== expectedCount) return false
	return problem.tests.every((expected) => reported.get(expected.id) === true)
}
