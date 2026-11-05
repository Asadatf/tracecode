import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewEvidenceHolds } from './review-evidence.ts'
import { PROBLEMS } from '../trace/problems.ts'

const problem = PROBLEMS['binary-search']
assert.ok(problem)
const good = () => ({
	status: 'completed',
	allPassed: true,
	testsPassed: problem.tests.length,
	testsTotal: problem.tests.length,
	tests: problem.tests.map((t) => ({ testId: t.id, passed: true }))
})

test('a complete, passing, meaningful run holds', () => {
	assert.equal(reviewEvidenceHolds(problem, good(), true), true)
})

test('untouched starter (server says not meaningful) never holds', () => {
	assert.equal(reviewEvidenceHolds(problem, good(), false), false)
})

test('syntax errors, timeouts, engine errors and failing runs never hold', () => {
	for (const status of ['syntax_error', 'timeout', 'engine_error']) {
		assert.equal(reviewEvidenceHolds(problem, { ...good(), status }, true), false, status)
	}
	assert.equal(reviewEvidenceHolds(problem, { ...good(), allPassed: false }, true), false)
	const oneFail = good()
	oneFail.tests[0] = { testId: oneFail.tests[0]!.testId, passed: false }
	assert.equal(reviewEvidenceHolds(problem, oneFail, true), false)
})

test('a report that does not cover every catalogue test exactly once is refused', () => {
	assert.equal(
		reviewEvidenceHolds(problem, { ...good(), tests: good().tests.slice(1) }, true),
		false
	)
	assert.equal(reviewEvidenceHolds(problem, { ...good(), tests: [] }, true), false)
	const dup = good()
	dup.tests[1] = { ...dup.tests[0]! }
	assert.equal(reviewEvidenceHolds(problem, dup, true), false)
	const unknown = good()
	unknown.tests[0] = { testId: 'not-a-real-test', passed: true }
	assert.equal(reviewEvidenceHolds(problem, unknown, true), false)
	assert.equal(
		reviewEvidenceHolds(problem, { ...good(), testsTotal: 1, testsPassed: 1 }, true),
		false
	)
	assert.equal(
		reviewEvidenceHolds(problem, { ...good(), testsPassed: problem.tests.length - 1 }, true),
		false
	)
})

test('a problem with no tests can never advance a review', () => {
	assert.equal(
		reviewEvidenceHolds(
			{ tests: [] },
			{ ...good(), tests: [], testsTotal: 0, testsPassed: 0 },
			true
		),
		false
	)
})

test('every catalogue problem accepts its own full pass', () => {
	for (const p of Object.values(PROBLEMS)) {
		const report = {
			status: 'completed',
			allPassed: true,
			testsPassed: p.tests.length,
			testsTotal: p.tests.length,
			tests: p.tests.map((t) => ({ testId: t.id, passed: true }))
		}
		assert.equal(reviewEvidenceHolds(p, report, true), true, p.slug)
	}
})
