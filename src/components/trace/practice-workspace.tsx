'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { runCode, traceCode } from '@/lib/trace/run-code'
import { problemMeta, type ProblemDefinition } from '@/lib/trace/problem'
import { PROBLEMS } from '@/lib/trace/problems'
import { teach, type TeachingPrompt } from '@/lib/trace/teach'
import {
	isContextualHintEligible,
	isOptimizationEligible,
	recommendReplay,
	type ReplayRecord
} from '@/lib/trace/learning-flow'
import { formatValue } from '@/lib/trace/value'
import {
	DEFAULT_LIMITS,
	type Json,
	type RunResult,
	type TestResult,
	type Trace,
	type Value
} from '@/lib/trace/contract'
import { CodeEditor } from './code-editor'
import { ReplayView } from './replay-view'
import { TeachingPanel } from './teaching-panel'
import styles from './practice.module.css'

const RUN_TIMEOUT_MS = 5000
const STAGES = ['01  Write', '02  Run', '03  Explore', '04  Improve']

interface LocalAttempt {
	id: string
	createdAt: string
	source: string
	result: RunResult
}
interface Outcome {
	passed: boolean
	actual?: Value
	expected: Value
	errored: boolean
}
interface ReplayState {
	kind: 'official' | 'custom'
	label: string
	source: string
	trace: Trace
	outcome: Outcome | null
}

function allPassed(result: RunResult): boolean {
	return (
		result.status === 'completed' && result.tests.length > 0 && result.tests.every((t) => t.passed)
	)
}

// Module-scope so its try/catch stays outside any component (the React Compiler
// cannot lower try statements inside a component).
function tryParseJson(raw: string): { ok: true; value: Json } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(raw) as Json }
	} catch {
		return { ok: false }
	}
}

export function PracticeWorkspace({ problem }: { problem: ProblemDefinition }) {
	const router = useRouter()
	const meta = problemMeta(problem)
	const [code, setCode] = useState(problem.starter)
	const [submitted, setSubmitted] = useState<{ source: string; result: RunResult } | null>(null)
	const [attempts, setAttempts] = useState<LocalAttempt[]>([])
	const [replayRecords, setReplayRecords] = useState<ReplayRecord[]>([])
	const [replay, setReplay] = useState<ReplayState | null>(null)
	const [status, setStatus] = useState<{ busy: boolean; label: string }>({ busy: false, label: '' })
	const [notice, setNotice] = useState('')
	const [customValues, setCustomValues] = useState<string[]>(() =>
		problem.params.map((_, i) => JSON.stringify(problem.examples[0]?.args[i] ?? null))
	)
	const busyRef = useRef(false)
	const tokenRef = useRef(0)

	const busy = status.busy

	function labelFor(args: Json[]): string {
		return `${problem.entry}(${args.map((a) => JSON.stringify(a)).join(', ')})`
	}
	function namedInput(args: Json[]): string {
		return JSON.stringify(
			Object.fromEntries(problem.params.map((p, i) => [p.name, args[i] ?? null]))
		)
	}

	function withEngine<T>(
		label: string,
		run: (onStatus: (p: 'loading_runtime' | 'running') => void) => Promise<T>
	): Promise<T | null> {
		if (busyRef.current) return Promise.resolve(null)
		busyRef.current = true
		const token = ++tokenRef.current
		setNotice('')
		setStatus({ busy: true, label })
		const finish = () => {
			busyRef.current = false
			if (token === tokenRef.current) setStatus({ busy: false, label: '' })
		}
		const onStatus = (phase: 'loading_runtime' | 'running') => {
			if (token === tokenRef.current)
				setStatus({
					busy: true,
					label: phase === 'loading_runtime' ? 'Loading Python runtime…' : label
				})
		}
		return run(onStatus).then(
			(value) => {
				finish()
				return value
			},
			(error: unknown) => {
				finish()
				if (token === tokenRef.current)
					setNotice(error instanceof Error ? error.message : 'Unexpected error.')
				return null
			}
		)
	}

	async function runTests() {
		if (code.trim() === '') {
			setNotice('Write some code before running the tests.')
			return
		}
		const source = code
		const result = await withEngine('Running tests…', (onStatus) =>
			runCode(
				{
					code: source,
					entry: problem.entry,
					tests: problem.tests,
					limits: { timeoutMs: RUN_TIMEOUT_MS }
				},
				{ onStatus }
			)
		)
		if (result == null) return
		setReplay(null)
		setSubmitted({ source, result })
		setAttempts((prev) => [
			...prev,
			{ id: `a${Date.now()}`, createdAt: new Date().toISOString(), source, result }
		])
		if (result.status === 'timeout') setNotice('Execution timed out — check for an infinite loop.')
		if (result.status === 'engine_error')
			setNotice(result.error?.message ?? 'The engine could not run this code.')
	}

	async function replayOfficial(
		test: { id: string; args: Json[] },
		source: string,
		attemptIndex: number
	) {
		const result = await withEngine('Replaying…', (onStatus) =>
			traceCode(
				{
					code: source,
					entry: problem.entry,
					input: { args: test.args },
					limits: { maxSteps: DEFAULT_LIMITS.maxSteps, timeoutMs: RUN_TIMEOUT_MS }
				},
				{ onStatus }
			)
		)
		if (result == null) return
		if (result.status !== 'completed' || result.trace == null) {
			setNotice(`Could not capture a trace (${result.status}).`)
			return
		}
		const runResult = attemptIndex >= 0 ? attempts[attemptIndex]?.result : submitted?.result
		const tr = runResult?.tests.find((t) => t.testId === test.id)
		const outcome: Outcome | null =
			tr != null
				? { passed: tr.passed, actual: tr.actual, expected: tr.expected, errored: tr.error != null }
				: null
		setReplay({
			kind: 'official',
			label: labelFor(test.args),
			source,
			trace: result.trace,
			outcome
		})
		setReplayRecords((prev) => [...prev, { attemptIndex, testPassed: tr?.passed === true }])
	}

	function parseCustomArgs(): { args: Json[] } | { error: string } {
		const args: Json[] = []
		for (let i = 0; i < problem.params.length; i++) {
			const parsedResult = tryParseJson(customValues[i] ?? '')
			if (!parsedResult.ok) return { error: `${problem.params[i]?.name}: not valid JSON.` }
			const parsed = parsedResult.value
			const exampleArg = problem.examples[0]?.args[i]
			if (Array.isArray(exampleArg)) {
				if (!Array.isArray(parsed))
					return { error: `${problem.params[i]?.name} must be a JSON array.` }
				if (parsed.length > 50)
					return { error: `${problem.params[i]?.name} must have at most 50 elements.` }
			}
			args.push(parsed)
		}
		return { args }
	}

	async function runCustom() {
		const parsed = parseCustomArgs()
		if ('error' in parsed) {
			setNotice(parsed.error)
			return
		}
		const source = code
		const result = await withEngine('Running custom input…', (onStatus) =>
			traceCode(
				{
					code: source,
					entry: problem.entry,
					input: { args: parsed.args },
					limits: { maxSteps: DEFAULT_LIMITS.maxSteps, timeoutMs: RUN_TIMEOUT_MS }
				},
				{ onStatus }
			)
		)
		if (result == null) return
		if (result.status !== 'completed' || result.trace == null) {
			setNotice(`Custom run did not complete (${result.status}).`)
			return
		}
		setReplay({
			kind: 'custom',
			label: `${labelFor(parsed.args)} · exploration (not scored)`,
			source,
			trace: result.trace,
			outcome: null
		})
	}

	function fillPreset(size: number) {
		const arrayIndex = problem.params.findIndex((_, i) =>
			Array.isArray(problem.examples[0]?.args[i])
		)
		if (arrayIndex < 0) return
		const values = Array.from({ length: size }, (_, i) => ((i * 7 + 3) % 97) - 20)
		setCustomValues((prev) => prev.map((v, i) => (i === arrayIndex ? JSON.stringify(values) : v)))
	}

	// Teaching, tied to observed evidence + the learning-flow gates.
	const attemptsForFlow = attempts.map((a) => ({ passed: allPassed(a.result), source: a.source }))
	let teaching: TeachingPrompt = null
	if (submitted != null) {
		if (allPassed(submitted.result)) {
			const sample = submitted.result.tests[0]
			if (isOptimizationEligible({ allTestsPassed: true }) && sample != null) {
				teaching = teach({
					problem,
					trace: { source: submitted.source.split('\n'), steps: [], truncated: false },
					outcome: {
						passed: true,
						actual: sample.actual,
						expected: sample.expected,
						errored: false
					},
					allTestsPassed: true
				})
			}
		} else if (
			replay != null &&
			replay.kind === 'official' &&
			replay.outcome != null &&
			!replay.outcome.passed &&
			isContextualHintEligible({ attempts: attemptsForFlow, replays: replayRecords })
		) {
			teaching = teach({
				problem,
				trace: replay.trace,
				outcome: replay.outcome,
				allTestsPassed: false
			})
		}
	}

	const showReplayNudge =
		submitted != null &&
		!allPassed(submitted.result) &&
		submitted.result.status === 'completed' &&
		teaching == null &&
		recommendReplay(attemptsForFlow)

	const stageIndex =
		submitted == null ? 0 : allPassed(submitted.result) ? 3 : replay != null ? 2 : 1
	const bestPassed = Math.max(
		0,
		...attempts.map((a) => a.result.tests.filter((t) => t.passed).length)
	)

	return (
		<div className={styles.page}>
			<header className={styles.top}>
				<Link className={styles.brand} href="/">
					<span className={styles.mark}>⌁</span> tracecode<span className={styles.dot}>.</span>
				</Link>
				<div className={styles.topData}>
					<select
						className={styles.select}
						value={problem.slug}
						aria-label="Choose problem"
						onChange={(e) => router.push(`/practice/${e.target.value}`)}
					>
						{Object.values(PROBLEMS).map((p) => (
							<option key={p.slug} value={p.slug}>
								{p.title}
							</option>
						))}
					</select>
					<Link className={styles.topLink} href="/progress">
						Progress
					</Link>
				</div>
			</header>

			<div className={styles.shell}>
				<div className={styles.head}>
					<div>
						<div className={styles.eyebrow}>Practice / {problem.conceptTags.join(' · ')}</div>
						<h1 className={styles.h1}>
							{problem.title}
							<span className={styles.dot}>.</span>
						</h1>
						<p className={styles.subtitle}>
							A small problem. A powerful way to understand your code.
						</p>
					</div>
					<div className={styles.stages}>
						{STAGES.map((label, i) => (
							<div key={label} className={cn(styles.stage, i === stageIndex && styles.stageActive)}>
								{label}
							</div>
						))}
					</div>
				</div>

				<div className={styles.workspace}>
					<section className={styles.panel}>
						<div className={styles.panelHead}>
							<strong>◫&nbsp; The challenge</strong>
							<span className={styles.pill}>
								{problem.difficulty} · {problem.conceptTags[0]}
							</span>
						</div>
						<div className={styles.problem}>
							{problem.statement.map((para, i) => (
								<p key={i}>{para}</p>
							))}
							<div className={styles.divider} />
							<strong className={styles.exampleLabel}>Think through an example</strong>
							{problem.examples.map((ex, i) => (
								<div key={i} className={styles.example}>
									<small>Example {String(i + 1).padStart(2, '0')}</small>
									<code>
										{problem.params
											.map((p, j) => `${p.name} = ${JSON.stringify(ex.args[j])}\n`)
											.join('')}
										output = {JSON.stringify(ex.output)}
									</code>
								</div>
							))}
						</div>
					</section>

					<div className={styles.right}>
						<section className={styles.editorPanel}>
							<div className={styles.editorTop}>
								<div className={styles.file}>
									<span className={styles.py}>Py</span> {problem.entry}.py
								</div>
								<span className={styles.live}>
									{busy ? status.label : 'Python runs in your browser'}
								</span>
							</div>
							<CodeEditor value={code} onChange={setCode} />
							<div className={styles.editorFooter}>
								<span className={styles.mutedDark}>Python 3 · runs locally in a Web Worker</span>
								<div className={styles.footerActions}>
									<button
										type="button"
										className={styles.btn}
										onClick={() => setCode(problem.starter)}
										disabled={busy}
									>
										Reset
									</button>
									<button
										type="button"
										className={cn(styles.btn, styles.btnRun)}
										onClick={runTests}
										disabled={busy}
									>
										▶ Run code
									</button>
								</div>
							</div>
						</section>

						<section className={styles.panel}>
							<div className={styles.panelHead}>
								<strong>⌘&nbsp; Custom input playground</strong>
								<span className={styles.pill}>Exploration · not scored</span>
							</div>
							<div className={styles.customContent}>
								<p className={styles.customHeadNote}>
									Keep your Python function in the editor. Change the arguments below to explore
									different execution paths, then replay the actual result.
								</p>
								<div className={styles.customFields}>
									{problem.params.map((p, i) => (
										<label key={p.name} className={styles.customField}>
											<span>{p.name}</span>
											<input
												value={customValues[i] ?? ''}
												onChange={(e) =>
													setCustomValues((prev) =>
														prev.map((v, idx) => (idx === i ? e.target.value : v))
													)
												}
												aria-label={`Custom ${p.name}`}
											/>
										</label>
									))}
								</div>
								<div className={styles.customControls}>
									<button
										type="button"
										className={cn(styles.btn, styles.btnDark)}
										onClick={runCustom}
										disabled={busy}
									>
										▶ Run custom input
									</button>
									<button
										type="button"
										className={styles.btn}
										onClick={() => fillPreset(10)}
										disabled={busy}
									>
										10 elements
									</button>
									<button
										type="button"
										className={styles.btn}
										onClick={() => fillPreset(20)}
										disabled={busy}
									>
										20 elements
									</button>
									<span className={styles.customFeedback}>
										Runs separately from the official tests.
									</span>
								</div>
							</div>
						</section>

						<section className={cn(styles.panel, styles.resultsPanel)}>
							{showReplayNudge && (
								<div className={styles.replayNudge}>
									Your answer did not pass all tests. <strong>Replay a failing test</strong> to see
									what your code actually did before changing it.
								</div>
							)}
							<div className={styles.panelHead}>
								<strong>Test results</strong>
								<span className={styles.resultSummary}>
									{submitted == null
										? 'Not run yet'
										: submitted.result.status === 'completed'
											? `${submitted.result.tests.filter((t) => t.passed).length} / ${submitted.result.tests.length} passed`
											: submitted.result.status}
								</span>
							</div>
							{submitted == null ? (
								<div className={styles.empty}>
									Run your solution to see real Python test results.
								</div>
							) : (
								<ResultsBody
									result={submitted.result}
									problem={problem}
									busy={busy}
									namedInput={namedInput}
									onReplay={(t) => replayOfficial(t, submitted.source, attempts.length - 1)}
								/>
							)}
						</section>
					</div>
				</div>

				{notice !== '' && <p className={styles.warn}>{notice}</p>}

				{teaching != null && (
					<TeachingPanel
						key={teaching.kind === 'diagnosis' ? teaching.id : teaching.kind}
						prompt={teaching}
					/>
				)}

				{attempts.length > 0 && (
					<section className={cn(styles.panel, styles.coachPanel)} style={{ background: '#fff' }}>
						<div className={styles.panelHead}>
							<strong>Learning progress · This browser</strong>
							<span className={styles.pill}>Local only</span>
						</div>
						<div className={styles.progressGrid}>
							<div className={styles.progressMetric}>
								<strong>{attempts.length}</strong>
								<span>Attempts</span>
							</div>
							<div className={styles.progressMetric}>
								<strong>
									{bestPassed} / {problem.tests.length}
								</strong>
								<span>Best tests passed</span>
							</div>
							<div className={styles.progressMetric}>
								<strong>{replayRecords.length}</strong>
								<span>Replays</span>
							</div>
						</div>
						<div className={styles.progressList}>
							{attempts
								.slice()
								.reverse()
								.map((attempt, idxFromEnd) => {
									const index = attempts.length - 1 - idxFromEnd
									const passedCount = attempt.result.tests.filter((t) => t.passed).length
									const firstFail = attempt.result.tests.find((t) => !t.passed)
									const failArgs =
										firstFail != null
											? problem.tests.find((t) => t.id === firstFail.testId)?.args
											: undefined
									return (
										<div key={attempt.id} className={styles.progressItem}>
											<span>
												<strong>
													{attempt.result.status === 'completed'
														? `${passedCount} / ${attempt.result.tests.length} passed`
														: attempt.result.status}
												</strong>{' '}
												<small>{new Date(attempt.createdAt).toLocaleTimeString()}</small>
											</span>
											<span className={styles.testActions}>
												<button
													type="button"
													className={styles.btn}
													onClick={() => setCode(attempt.source)}
													disabled={busy}
												>
													Load code
												</button>
												{firstFail != null && failArgs != null && (
													<button
														type="button"
														className={styles.btn}
														onClick={() =>
															replayOfficial(
																{ id: firstFail.testId, args: failArgs },
																attempt.source,
																index
															)
														}
														disabled={busy}
													>
														Replay failure
													</button>
												)}
											</span>
										</div>
									)
								})}
						</div>
					</section>
				)}

				{replay != null && (
					<ReplayView trace={replay.trace} meta={meta} label={replay.label} kind={replay.kind} />
				)}

				<div className={styles.foot}>
					First-load internet access is required for the Pyodide runtime. Python executes locally in
					a browser Web Worker; worker timeout and trace length are bounded. This is not a hardened
					security sandbox.
				</div>
			</div>
		</div>
	)
}

function ResultsBody({
	result,
	problem,
	busy,
	namedInput,
	onReplay
}: {
	result: RunResult
	problem: ProblemDefinition
	busy: boolean
	namedInput: (args: Json[]) => string
	onReplay: (test: { id: string; args: Json[] }) => void
}) {
	if (result.status === 'syntax_error') {
		return (
			<div className={styles.empty} style={{ color: '#a74332' }}>
				Syntax error on line {result.syntaxError?.line}: {result.syntaxError?.message}
			</div>
		)
	}
	if (result.status === 'engine_error') {
		return (
			<div className={styles.empty} style={{ color: '#a74332' }}>
				{result.error?.type === 'entry_not_found'
					? `No function named ${problem.entry} was found.`
					: (result.error?.message ?? 'Engine error.')}
			</div>
		)
	}
	if (result.status === 'timeout') {
		return (
			<div className={styles.empty} style={{ color: '#a74332' }}>
				Execution timed out. Check for an infinite loop and run again.
			</div>
		)
	}
	return (
		<div>
			{result.tests.map((test) => {
				const args = problem.tests.find((t) => t.id === test.testId)?.args ?? []
				return (
					<ResultRow
						key={test.testId}
						test={test}
						args={args}
						busy={busy}
						namedInput={namedInput}
						onReplay={() => onReplay({ id: test.testId, args })}
					/>
				)
			})}
		</div>
	)
}

function ResultRow({
	test,
	args,
	busy,
	namedInput,
	onReplay
}: {
	test: TestResult
	args: Json[]
	busy: boolean
	namedInput: (args: Json[]) => string
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
						: `Returned: ${test.actual != null ? formatValue(test.actual) : '—'}`}
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
