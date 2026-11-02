'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { analyzeCode, isEngineBooted, runCode, traceCode, warmUpEngine } from '@/lib/trace/run-code'
import { withCodeFeatures } from '@/lib/learning/attempt-features'
import { problemMeta, type ProblemDefinition } from '@/lib/trace/problem'
import { PROBLEMS } from '@/lib/trace/problems'
import { isGuestPracticeSlug } from '@/lib/auth/access'
import { optimizationPrompt, teach, type TeachingPrompt } from '@/lib/trace/teach'
import { buildRunRequest } from '@/lib/trace/grading'
import {
	isContextualHintEligible,
	findSolvedAttempt,
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
import { saveAttempt, recordReplaySession, recordLearningEvent } from '@/server/actions/learning'
import { resolveAttemptDbId } from '@/lib/learning/replay-link'
import { hintRevealDetail } from '@/lib/learning/hint-event'
import { replayInspectedEvent } from '@/lib/learning/replay-writes'
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
	// Set once this attempt has been persisted to the server for a signed-in user.
	dbId?: string
	synced?: boolean
	// The in-flight save (resolves to the server id, or undefined if not saved).
	// A replay waits on this rather than on `dbId`, which it can't see in time.
	saving?: Promise<string | undefined>
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

// Resolves the problem on the client from its slug (the catalog is already in
// this bundle for the picker), so the server never serializes a problem's test
// data — some official tests are large — into the page payload.
export function PracticeWorkspace({
	slug,
	isAuthenticated = false
}: {
	slug: string
	isAuthenticated?: boolean
}) {
	const problem = PROBLEMS[slug]
	if (problem == null) return null
	return <ProblemWorkspace problem={problem} isAuthenticated={isAuthenticated} />
}

// Long inputs (a 20 000-character string, a 10 000-element list) are clipped in
// labels so a result row stays readable; the real input is what runs.
const MAX_LABEL_CHARS = 120
function clip(text: string): string {
	return text.length > MAX_LABEL_CHARS
		? `${text.slice(0, MAX_LABEL_CHARS)}… (${text.length} chars)`
		: text
}

function ProblemWorkspace({
	problem,
	isAuthenticated
}: {
	problem: ProblemDefinition
	isAuthenticated: boolean
}) {
	const router = useRouter()
	const meta = problemMeta(problem)
	const [code, setCode] = useState(problem.starter)
	const [submitted, setSubmitted] = useState<{ source: string; result: RunResult } | null>(null)
	const [attempts, setAttempts] = useState<LocalAttempt[]>([])
	const [replayRecords, setReplayRecords] = useState<ReplayRecord[]>([])
	const [replay, setReplay] = useState<ReplayState | null>(null)
	const [status, setStatus] = useState<{ busy: boolean; label: string }>({ busy: false, label: '' })
	const [notice, setNotice] = useState('')

	// Start the Python download as the page opens (fail-and-replay AC1), so the
	// first Run doesn't wait on it. Fire-and-forget: a failed warm-up just
	// leaves the first Run to load Pyodide itself, with its own error handling.
	useEffect(() => {
		void warmUpEngine()
	}, [])
	const editorPanelRef = useRef<HTMLElement>(null)
	const busyRef = useRef(false)
	const tokenRef = useRef(0)

	const busy = status.busy

	function labelFor(args: Json[]): string {
		return clip(`${problem.entry}(${args.map((a) => JSON.stringify(a)).join(', ')})`)
	}
	function namedInput(args: Json[]): string {
		return clip(
			JSON.stringify(Object.fromEntries(problem.params.map((p, i) => [p.name, args[i] ?? null])))
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
		// A Run during the warm-up queues behind it; say why it's waiting.
		setStatus({ busy: true, label: isEngineBooted() ? label : 'Loading Python runtime…' })
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

	// Server persistence (signed-in only). Best-effort and non-blocking: a failed
	// write never interrupts execution, and nothing claims "saved" unless the
	// server confirms it (the attempt gets a dbId / synced flag only then).
	// M7.1: the source is parsed (never executed) for its structural features
	// first — the same string that is saved, via withCodeFeatures. That queues
	// right behind the Run on the same worker and never rejects; an unparseable
	// source or an unavailable worker just means the attempt is saved without
	// features, exactly as before.
	function persistAttempt(
		localId: string,
		source: string,
		result: RunResult
	): Promise<string | undefined> | undefined {
		if (!isAuthenticated) return undefined
		const payload = {
			problemSlug: problem.slug,
			source,
			status: result.status,
			testsPassed: result.tests.filter((t) => t.passed).length,
			testsTotal: result.tests.length,
			allPassed: allPassed(result),
			tests: result.tests.map((t) => ({
				testId: t.testId,
				passed: t.passed,
				expected: t.expected,
				actual: t.actual,
				errorType: t.error?.type,
				errorMessage: t.error?.message
			}))
		}
		return withCodeFeatures(payload, (code) => analyzeCode({ code }))
			.then((withFeatures) => saveAttempt(withFeatures))
			.then(
				(res) => {
					if (!res.ok || !res.data.persisted) return undefined
					const dbId = res.data.attemptId
					setAttempts((prev) =>
						prev.map((a) => (a.id === localId ? { ...a, dbId, synced: true } : a))
					)
					return dbId
				},
				() => undefined
			)
	}

	async function persistReplay(
		attempt: LocalAttempt | undefined,
		testId: string,
		testPassed: boolean
	) {
		if (!isAuthenticated) return
		const dbId = await resolveAttemptDbId(attempt)
		const call =
			dbId != null
				? recordReplaySession({ attemptId: dbId, problemSlug: problem.slug, testId, testPassed })
				: recordLearningEvent(replayInspectedEvent(problem.slug, testId))
		void call.then(
			() => {},
			() => {}
		)
	}

	function persistHint(detail: string) {
		if (!isAuthenticated) return
		void recordLearningEvent({ problemSlug: problem.slug, type: 'hint_revealed', detail }).then(
			() => {},
			() => {}
		)
	}

	// The attempts list sits well below the editor, so restoring code there is
	// invisible unless the editor is brought back into view.
	function loadAttempt(source: string) {
		setCode(source)
		editorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}

	async function runTests() {
		if (code.trim() === '') {
			setNotice('Write some code before running the tests.')
			return
		}
		const source = code
		const result = await withEngine('Running tests…', (onStatus) =>
			runCode(buildRunRequest(problem, source, { timeoutMs: RUN_TIMEOUT_MS }), { onStatus })
		)
		if (result == null) return
		setReplay(null)
		setSubmitted({ source, result })
		const localId = `a${Date.now()}`
		const saving = persistAttempt(localId, source, result)
		setAttempts((prev) => [
			...prev,
			{ id: localId, createdAt: new Date().toISOString(), source, result, saving }
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
		const attempt = attemptIndex >= 0 ? attempts[attemptIndex] : attempts.at(-1)
		void persistReplay(attempt, test.id, tr?.passed === true)
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

	// Stage B. "Solved" is any attempt that passed every official test, so a later
	// failing experiment never un-solves the problem; the first solving attempt is
	// kept so the learner can always get back to it. The challenge is static
	// guidance — nothing here claims anything about the solution's complexity.
	const firstSolve = findSolvedAttempt(attemptsForFlow)
	const solvedIndex = firstSolve != null ? attemptsForFlow.indexOf(firstSolve) : -1
	const solvedAttempt = solvedIndex >= 0 ? attempts[solvedIndex] : undefined
	const challenge =
		solvedAttempt != null && isOptimizationEligible({ allTestsPassed: true })
			? optimizationPrompt(problem)
			: null

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
								{!isAuthenticated && !isGuestPracticeSlug(p.slug) ? `${p.title} 🔒` : p.title}
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
						<section ref={editorPanelRef} className={styles.editorPanel}>
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
						onReveal={(level) => {
							const detail = hintRevealDetail(teaching, level)
							if (detail != null) persistHint(detail)
						}}
					/>
				)}

				{challenge != null && solvedAttempt != null && (
					<section className={styles.coachPanel} data-testid="optimization-challenge">
						<div className={styles.coachMeta}>
							<span className={styles.coachTag}>Solved · optional challenge</span>
						</div>
						<p>
							All {problem.tests.length} tests passed (
							{new Date(solvedAttempt.createdAt).toLocaleTimeString()}). That solution stays saved
							in your attempts, and trying something else never unsolves this problem.
						</p>
						<div style={{ marginBottom: 12 }}>
							<button
								type="button"
								className={styles.btn}
								onClick={() => loadAttempt(solvedAttempt.source)}
								disabled={busy}
							>
								Restore my solved code
							</button>
						</div>
						<p>{problem.optimization?.goal}</p>
						<TeachingPanel
							key={challenge.kind === 'diagnosis' ? challenge.id : challenge.kind}
							prompt={challenge}
							onReveal={(level) => {
								const detail = hintRevealDetail(challenge, level)
								if (detail != null) persistHint(detail)
							}}
						/>
					</section>
				)}

				{attempts.length > 0 && (
					<section className={cn(styles.panel, styles.coachPanel)} style={{ background: '#fff' }}>
						<div className={styles.panelHead}>
							<strong>Your attempts</strong>
							<span className={styles.pill}>
								{isAuthenticated
									? 'Signed in · saved to your account'
									: 'This session only · sign in to save'}
							</span>
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
												{attempt.synced === true ? <small> · synced</small> : null}
											</span>
											<span className={styles.testActions}>
												<button
													type="button"
													className={styles.btn}
													onClick={() => loadAttempt(attempt.source)}
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
						resultLabel={
							problem.grading?.mode === 'mutate-arg'
								? `${problem.params[problem.grading.argIndex]?.name ?? 'argument'} after the call`
								: 'Returned'
						}
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
	resultLabel,
	onReplay
}: {
	test: TestResult
	args: Json[]
	busy: boolean
	namedInput: (args: Json[]) => string
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
						: `${resultLabel}: ${test.actual != null ? formatValue(test.actual) : '—'}`}
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
