// The Run experience in the Practice workspace. The runner cannot render React, so the
// component-level decisions are pinned by reading the source; the behaviour behind them is
// tested in lib/trace/live-run.test.mts and lib/trace/run-streaming.test.mts, and verified in
// the browser (e2e/practice-run-progress.spec.ts).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const workspace = read('./practice-workspace.tsx')
const panel = read('./results-panel.tsx')

// The body of runTests(), up to the next top-level function.
const runTests = workspace.slice(
	workspace.indexOf('async function runTests()'),
	workspace.indexOf('async function replayOfficial(')
)

describe('Run in the practice workspace', () => {
	it('opens the Tests tab as the run begins, once, and never switches tabs again', () => {
		const [beforeAwait, afterAwait] = runTests.split('const result = await withEngine(')
		assert.equal(beforeAwait?.includes('setResultsTab'), false)
		const inCallback = afterAwait?.split('const streamed')[0] ?? ''
		assert.equal((inCallback.match(/setResultsTab\('tests'\)/g) ?? []).length, 1)
		// After the run has ended nothing moves the learner: a tab they chose meanwhile stays.
		const afterRun = afterAwait?.split('const streamed')[1] ?? ''
		assert.doesNotMatch(afterRun, /setResultsTab/)
	})

	it('also reveals the results: a collapsed pane opens and a phone gets its Results view', () => {
		assert.match(runTests, /layoutApiRef\.current\?\.revealResults\(\)/)
		const layout = read('./workspace/workspace-layout.tsx')
		assert.match(layout, /revealResults\(\) \{\s*if \(layout\.resultsCollapsed\) setLayout\(/)
		assert.match(layout, /setPhoneView\('results'\)/)
		// Transient: the learner's saved layout (the cookie) is not rewritten by a Run.
		const reveal = layout.slice(
			layout.indexOf('revealResults() {'),
			layout.indexOf('function toggleMax')
		)
		assert.doesNotMatch(reveal, /commit\(/)
	})

	it('builds the live view only from worker events of the current run', () => {
		assert.match(runTests, /onTestResult: \(index, test\) =>/)
		assert.match(runTests, /if \(tokenRef\.current !== run\.id\) return/)
		assert.match(runTests, /acceptTestResult\(run\.live, run\.id, index, test\)/)
		// The finished result, not the streamed one, is what is graded, saved and counted.
		assert.match(runTests, /setSubmitted\(\{\s*source,\s*result,/)
		assert.match(runTests, /persistAttempt\(localId, source, result\)/)
	})

	it('keeps streamed results only for a run that ended without a result', () => {
		assert.match(runTests, /streamed: result\.status === 'completed' \? undefined : streamed/)
	})

	it('ends the live view whether the run completes, times out or throws', () => {
		const clear = runTests.indexOf('setLiveRun((current)')
		assert.ok(clear > -1)
		// It is cleared before the early return for a failed run, so it cannot get stuck.
		assert.ok(clear < runTests.indexOf('if (result == null) return'))
	})

	it('shows the live view in place of the previous run, so two runs never share a screen', () => {
		assert.match(workspace, /liveRun != null \? \(\s*<LiveResultsBody/)
	})

	it('the tutor is never handed the live progress as if it were the run summary', () => {
		assert.match(workspace, /runSummary: submitted == null \? null : resultSummary/)
		assert.match(workspace, /liveSummary \?\? resultSummary/)
	})

	it('announces concisely: one status line, not every test', () => {
		// The live panel is a visual region; only the existing status line is polite.
		const live = panel.slice(panel.indexOf('export function LiveResultsBody'))
		assert.doesNotMatch(live.split('function WaitingRow')[0] ?? '', /aria-live|role="status"/)
		assert.match(live, /aria-busy="true"/)
	})

	it('uses the small branded loader, not the full-screen curtain', () => {
		assert.match(panel, /<TraceLoader tone="light" width=\{44\} \/>/)
		assert.doesNotMatch(workspace + panel, /NavigationCurtain|useReportNavigationPending/)
	})

	it('keeps visible tests and the condensed validation checks', () => {
		assert.match(panel, /splitResults\(problem, result\.tests\)/)
		assert.match(panel, /<ValidationChecks/)
		assert.match(panel, /pending=\{view\.checks\.total - view\.checks\.completed\}/)
	})
})
