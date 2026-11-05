'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Json, RunResult, TestResult } from '@/lib/trace/contract'
import { describeLiveRun, type LiveRow, type LiveRun } from '@/lib/trace/live-run'
import type { ProblemDefinition } from '@/lib/trace/problem'
import { formatValue } from '@/lib/trace/value'
import { splitResults } from '@/lib/trace/visible-tests'
import { TraceLoader } from '@/components/ui/trace-loader'
import styles from './practice.module.css'

// The Tests tab body: the finished run's results, and the live view while a run is still
// executing. Both draw their rows with the same ResultRow and the same condensed
// "validation checks" group, so what the learner sees does not change shape when the run ends.

type NamedInput = (args: Json[]) => string

function resultLabelFor(problem: ProblemDefinition): string {
	return problem.grading?.mode === 'mutate-arg'
		? `${problem.params[problem.grading.argIndex]?.name ?? 'argument'} after the call`
		: 'Returned'
}

export function ResultsBody({
	result,
	streamed,
	problem,
	busy,
	namedInput,
	onReplay
}: {
	result: RunResult
	// What the worker reported before this run ended without a result (a timeout, an engine
	// error). Shown under the message so completed tests are not thrown away; never used when
	// the run completed — then `result` is the only truth.
	streamed?: readonly TestResult[]
	problem: ProblemDefinition
	busy: boolean
	namedInput: NamedInput
	onReplay: (test: { id: string; args: Json[] }) => void
}) {
	const row = (test: TestResult) => {
		const args = problem.tests.find((t) => t.id === test.testId)?.args ?? []
		return (
			<ResultRow
				key={test.testId}
				test={test}
				args={args}
				busy={busy}
				namedInput={namedInput}
				resultLabel={resultLabelFor(problem)}
				onReplay={() => onReplay({ id: test.testId, args })}
			/>
		)
	}
	const message = failureMessage(result, problem)
	if (message != null) {
		const partial = streamed ?? []
		return (
			<div>
				<div className={styles.empty} style={{ color: '#a74332' }}>
					{message}
				</div>
				{partial.length > 0 && (
					<>
						<p className={styles.partialNote}>
							{partial.length} of {problem.tests.length} tests finished before the run stopped.
						</p>
						<PartialRows problem={problem} results={partial} row={row} />
					</>
				)}
			</div>
		)
	}
	const split = splitResults(problem, result.tests)
	return (
		<div>
			{split.visible.map(row)}
			{split.checks.length > 0 && (
				<ValidationChecks passed={split.passedChecks} failed={split.failedChecks} row={row} />
			)}
		</div>
	)
}

function failureMessage(result: RunResult, problem: ProblemDefinition): string | null {
	if (result.status === 'syntax_error') {
		return `Syntax error on line ${result.syntaxError?.line}: ${result.syntaxError?.message}`
	}
	if (result.status === 'engine_error') {
		return result.error?.type === 'entry_not_found'
			? `No function named ${problem.entry} was found.`
			: (result.error?.message ?? 'Engine error.')
	}
	if (result.status === 'timeout') {
		return 'Execution timed out. Check for an infinite loop and run again.'
	}
	return null
}

// Tests that did finish before a run stopped: the same split as a finished run.
function PartialRows({
	problem,
	results,
	row
}: {
	problem: ProblemDefinition
	results: readonly TestResult[]
	row: (test: TestResult) => ReactNode
}) {
	const split = splitResults(problem, results)
	return (
		<div>
			{split.visible.map(row)}
			{split.checks.length > 0 && (
				<ValidationChecks passed={split.passedChecks} failed={split.failedChecks} row={row} />
			)}
		</div>
	)
}

// While the tests run. Every row is a real event from the worker: a finished test shows its
// result (and a failure its details) the moment it arrives, the one executing now says so, the
// rest say pending. The counts are the events received, nothing more.
export function LiveResultsBody({
	run,
	problem,
	namedInput
}: {
	run: LiveRun
	problem: ProblemDefinition
	namedInput: NamedInput
}) {
	const view = describeLiveRun(problem, run)
	const resultLabel = resultLabelFor(problem)
	const argsOf = (testId: string) => problem.tests.find((t) => t.id === testId)?.args ?? []
	const row = (test: TestResult) => (
		<ResultRow
			key={test.testId}
			test={test}
			args={argsOf(test.testId)}
			busy
			namedInput={namedInput}
			resultLabel={resultLabel}
			onReplay={() => undefined}
		/>
	)
	return (
		<div aria-busy="true">
			{/* Visual progress only. It is deliberately not a live region: one polite "Running
			    tests…" is announced by the status line, not every test as it lands. */}
			<div className={styles.liveHead}>
				<TraceLoader tone="light" width={44} />
				<span>
					Running tests · {view.completed} / {view.total} done
					{view.failed > 0 ? ` · ${view.failed} failed` : ''}
				</span>
			</div>
			{view.visible.map((entry) =>
				entry.result != null ? (
					row(entry.result)
				) : (
					<WaitingRow
						key={entry.testId}
						entry={entry}
						problem={problem}
						args={argsOf(entry.testId)}
						namedInput={namedInput}
					/>
				)
			)}
			{view.checks.total > 0 && (
				<ValidationChecks
					passed={view.checks.passedResults}
					failed={view.checks.failedResults}
					pending={view.checks.total - view.checks.completed}
					row={row}
				/>
			)}
		</div>
	)
}

// A test that has not finished: the one executing now, or one still waiting its turn.
function WaitingRow({
	entry,
	problem,
	args,
	namedInput
}: {
	entry: LiveRow
	problem: ProblemDefinition
	args: Json[]
	namedInput: NamedInput
}) {
	const expected = problem.tests.find((t) => t.id === entry.testId)?.expected
	return (
		<div className={styles.test}>
			<div>
				<div className={styles.testTitle}>○ {entry.testId}</div>
				<div className={styles.testDetail}>
					{namedInput(args)}
					{expected !== undefined ? ` → expected ${JSON.stringify(expected)}` : ''}
				</div>
			</div>
			<div className={styles.testActions}>
				<span
					className={cn(styles.status, entry.state === 'running' ? styles.running : styles.waiting)}
				>
					{entry.state === 'running' ? 'Running' : 'Pending'}
				</span>
			</div>
		</div>
	)
}

// The validation checks beyond the small teaching set: one summary line, with every FAILING check
// always listed, and the passing ones one press away (progressive disclosure, keyboard operable).
// While a run is still going, `pending` is how many of them have not finished yet; the line then
// says how far along they are instead of claiming a result.
function ValidationChecks({
	passed,
	failed,
	pending = 0,
	row
}: {
	passed: TestResult[]
	failed: TestResult[]
	pending?: number
	row: (test: TestResult) => ReactNode
}) {
	const [open, setOpen] = useState(false)
	const done = passed.length + failed.length
	const total = done + pending
	const summary =
		pending > 0
			? `${done} of ${total} more validation checks run${failed.length > 0 ? ` · ${failed.length} failed` : ''}`
			: failed.length === 0
				? `${total} more validation checks passed`
				: `${failed.length} of ${total} more validation checks failed`
	return (
		<div className={styles.checks}>
			<button
				type="button"
				className={styles.checksToggle}
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
				aria-controls="validation-checks"
			>
				<span aria-hidden="true">{open ? '▾' : '▸'}</span> <strong>{summary}</strong>{' '}
				<span className={styles.checksNote}>
					Extra edge cases and larger inputs that also have to pass.
				</span>
			</button>
			<div id="validation-checks">
				{failed.map(row)}
				{open && passed.map(row)}
			</div>
		</div>
	)
}

function ResultRow({
	test,
	args,
	busy,
	namedInput,
	resultLabel,
	onReplay
}: {
	test: TestResult
	args: Json[]
	busy: boolean
	namedInput: NamedInput
	resultLabel: string
	onReplay: () => void
}) {
	return (
		<div className={styles.test}>
			<div>
				<div className={styles.testTitle}>
					{test.passed ? '✓' : '×'} {test.testId}
				</div>
				<div className={styles.testDetail}>
					{namedInput(args)} → expected {formatValue(test.expected)}
					<br />
					{test.error != null
						? `Error: ${test.error.type}: ${test.error.message}`
						: `${resultLabel}: ${test.actual != null ? formatValue(test.actual) : '-'}`}
				</div>
			</div>
			<div className={styles.testActions}>
				<span className={cn(styles.status, test.passed ? styles.pass : styles.fail)}>
					{test.passed ? 'Passed' : 'Failed'}
				</span>
				<button type="button" className={styles.btn} onClick={onReplay} disabled={busy}>
					Replay
				</button>
			</div>
		</div>
	)
}
