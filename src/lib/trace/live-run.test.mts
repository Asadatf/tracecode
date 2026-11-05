import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { acceptTestResult, describeLiveRun, startLiveRun } from './live-run'
import type { TestResult } from './contract'
import { PROBLEMS } from './problems'

// What the results pane draws while a run executes, built only from the engine's per-test
// events. No React, no worker: the rules for ordering, staleness and counts.

const pass = (testId: string): TestResult => ({
	testId,
	passed: true,
	actual: { kind: 'int', value: 1 },
	expected: { kind: 'int', value: 1 }
})
const fail = (testId: string): TestResult => ({
	testId,
	passed: false,
	actual: { kind: 'int', value: 2 },
	expected: { kind: 'int', value: 1 }
})
const crash = (testId: string): TestResult => ({
	testId,
	passed: false,
	expected: { kind: 'int', value: 1 },
	error: { type: 'ZeroDivisionError', message: 'division by zero', line: 3 }
})

const IDS = ['a', 'b', 'c', 'd']

describe('accepting test results', () => {
	it('takes events one at a time, in order', () => {
		let run = startLiveRun(1, IDS)
		run = acceptTestResult(run, 1, 0, pass('a'))!
		run = acceptTestResult(run, 1, 1, fail('b'))!
		assert.deepEqual(
			run.results.map((r) => r.testId),
			['a', 'b']
		)
	})

	it('never mixes runs: another run id is dropped', () => {
		const run = startLiveRun(2, IDS)
		assert.equal(acceptTestResult(run, 1, 0, pass('a')), run)
		assert.equal(run.results.length, 0)
	})

	it('drops a duplicate, a gap and a mismatched test id', () => {
		let run = startLiveRun(1, IDS)
		run = acceptTestResult(run, 1, 0, pass('a'))!
		assert.equal(acceptTestResult(run, 1, 0, pass('a')), run, 'duplicate')
		assert.equal(acceptTestResult(run, 1, 2, pass('c')), run, 'gap')
		assert.equal(acceptTestResult(run, 1, 1, pass('c')), run, 'wrong test for this position')
		assert.equal(run.results.length, 1)
	})

	it('ignores events once nothing is running', () => {
		assert.equal(acceptTestResult(null, 1, 0, pass('a')), null)
	})

	it('does not accept more results than tests', () => {
		let run = startLiveRun(1, ['a'])
		run = acceptTestResult(run, 1, 0, pass('a'))!
		assert.equal(acceptTestResult(run, 1, 1, pass('b')), run)
	})
})

describe('describing a live run', () => {
	const problem = {
		tests: IDS.map((id) => ({ id, args: [], expected: 1 })),
		visibleTestIds: ['a', 'b']
	}

	it('starts with the first test running and every other pending, in test order', () => {
		const view = describeLiveRun(problem, startLiveRun(1, IDS))
		assert.deepEqual(
			view.rows.map((r) => [r.testId, r.state]),
			[
				['a', 'running'],
				['b', 'pending'],
				['c', 'pending'],
				['d', 'pending']
			]
		)
		assert.equal(view.completed, 0)
		assert.equal(view.total, 4)
	})

	it('shows passed, failed and runtime errors as they land, and moves "running" along', () => {
		let run = startLiveRun(1, IDS)
		run = acceptTestResult(run, 1, 0, pass('a'))!
		run = acceptTestResult(run, 1, 1, fail('b'))!
		run = acceptTestResult(run, 1, 2, crash('c'))!
		const view = describeLiveRun(problem, run)
		assert.deepEqual(
			view.rows.map((r) => r.state),
			['passed', 'failed', 'failed', 'running']
		)
		assert.equal(view.completed, 3)
		assert.equal(view.passed, 1)
		assert.equal(view.failed, 2)
		// Failure details are kept, so the learner can inspect them straight away.
		assert.equal(view.rows[2]?.result?.error?.message, 'division by zero')
	})

	it('has nothing running once every test has reported', () => {
		let run = startLiveRun(1, ['a', 'b'])
		run = acceptTestResult(run, 1, 0, pass('a'))!
		run = acceptTestResult(run, 1, 1, pass('b'))!
		const view = describeLiveRun({ tests: problem.tests.slice(0, 2) }, run)
		assert.deepEqual(
			view.rows.map((r) => r.state),
			['passed', 'passed']
		)
	})

	it('keeps the visible-test split: teaching tests listed, the rest counted as validation checks', () => {
		let run = startLiveRun(1, IDS)
		run = acceptTestResult(run, 1, 0, pass('a'))!
		run = acceptTestResult(run, 1, 1, pass('b'))!
		run = acceptTestResult(run, 1, 2, fail('c'))!
		const view = describeLiveRun(problem, run)
		assert.deepEqual(
			view.visible.map((r) => r.testId),
			['a', 'b']
		)
		// c finished (failed), d has not: 1 of 2 validation checks run, and the failure is listed.
		assert.equal(view.checks.total, 2)
		assert.equal(view.checks.completed, 1)
		assert.deepEqual(
			view.checks.failedResults.map((r) => r.testId),
			['c']
		)
		assert.equal(view.checks.passedResults.length, 0)
	})

	it('counts condensed checks accurately on a real problem', () => {
		const real = PROBLEMS['climbing-stairs']
		assert.ok(real?.visibleTestIds != null)
		const ids = real.tests.map((t) => t.id)
		let run = startLiveRun(1, ids)
		ids.slice(0, 7).forEach((id, index) => {
			run = acceptTestResult(run, 1, index, pass(id))!
		})
		const view = describeLiveRun(real, run)
		const checkIds = ids.filter((id) => !real.visibleTestIds?.includes(id))
		assert.equal(view.checks.total, checkIds.length)
		assert.equal(view.checks.completed, 1, 'only t7 of the checks has run')
		assert.equal(view.total, ids.length)
		assert.equal(view.completed, 7)
	})

	it('treats every test as visible when the problem names no teaching set', () => {
		const view = describeLiveRun({ tests: problem.tests }, startLiveRun(1, IDS))
		assert.equal(view.visible.length, 4)
		assert.equal(view.checks.total, 0)
	})
})
