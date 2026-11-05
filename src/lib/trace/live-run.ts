import type { TestResult } from './contract'
import type { ProblemDefinition } from './problem'
import { visibleTestIds } from './visible-tests'

// What the Run button shows WHILE the tests execute. The engine reports each test as it
// finishes (run-code.ts `onTestResult`); this turns those events into the rows the results
// pane draws — passed, failed, running, pending — and the counts, in the problem's own
// test order. It is presentation only: the final RunResult is still the one authoritative
// result, and nothing here is ever graded or persisted.

export interface LiveRun {
	// Which run these results belong to. An event from any other run is dropped, so two
	// runs can never mix.
	readonly runId: number
	// Every test id, in the order the runner executes them (the problem's order).
	readonly testIds: readonly string[]
	// Results so far, always a prefix of `testIds`.
	readonly results: readonly TestResult[]
}

export function startLiveRun(runId: number, testIds: readonly string[]): LiveRun {
	return { runId, testIds, results: [] }
}

// Take one completion event. Returns the same object when the event does not belong:
// a null run (nothing running), another run's id, an index that is not the next test, or a
// test id that is not the one expected at that index. Tests run one after another, so
// anything but "the next one" is stale or corrupt.
export function acceptTestResult(
	run: LiveRun | null,
	runId: number,
	index: number,
	test: TestResult
): LiveRun | null {
	if (run == null || run.runId !== runId) return run
	if (index !== run.results.length || run.testIds[index] !== test.testId) return run
	return { ...run, results: [...run.results, test] }
}

export type RowState = 'passed' | 'failed' | 'running' | 'pending'

export interface LiveRow {
	testId: string
	state: RowState
	result: TestResult | null
}

export interface LiveRunView {
	total: number
	completed: number
	passed: number
	failed: number
	// Every test in order, for whatever draws them.
	rows: LiveRow[]
	// The few tests the problem shows one by one, and the validation checks it summarises
	// (visible-tests.ts): same split as the finished view, so nothing jumps when the run ends.
	visible: LiveRow[]
	checks: {
		total: number
		completed: number
		passedResults: TestResult[]
		// A failing check is listed the moment it fails, as in the finished view.
		failedResults: TestResult[]
	}
}

export function describeLiveRun(
	problem: Pick<ProblemDefinition, 'tests' | 'visibleTestIds'>,
	run: LiveRun
): LiveRunView {
	const shown = visibleTestIds(problem)
	const byId = new Map(run.results.map((result) => [result.testId, result]))
	// Tests run strictly in order, so the first one without a result is the one running now.
	const runningId = run.testIds[run.results.length]

	const rows: LiveRow[] = run.testIds.map((testId) => {
		const result = byId.get(testId) ?? null
		const state: RowState =
			result != null
				? result.passed
					? 'passed'
					: 'failed'
				: testId === runningId
					? 'running'
					: 'pending'
		return { testId, state, result }
	})

	const checkRows = rows.filter((row) => !shown.has(row.testId))
	const done = checkRows.flatMap((row) => (row.result == null ? [] : [row.result]))
	return {
		total: rows.length,
		completed: run.results.length,
		passed: run.results.filter((result) => result.passed).length,
		failed: run.results.filter((result) => !result.passed).length,
		rows,
		visible: rows.filter((row) => shown.has(row.testId)),
		checks: {
			total: checkRows.length,
			completed: done.length,
			passedResults: done.filter((result) => result.passed),
			failedResults: done.filter((result) => !result.passed)
		}
	}
}
