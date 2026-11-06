'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/routing'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { analyzeCode, isEngineBooted, runCode, traceCode, warmUpEngine } from '@/lib/trace/run-code'
import { withCodeFeatures } from '@/lib/learning/attempt-features'
import { problemMeta, type ProblemDefinition } from '@/lib/trace/problem'
import { PROBLEMS } from '@/lib/trace/problems'
import { optimizationPrompt, teach, type TeachingPrompt } from '@/lib/trace/teach'
import { buildRunRequest } from '@/lib/trace/grading'
import { acceptTestResult, startLiveRun, type LiveRun } from '@/lib/trace/live-run'
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
import { FormatIcon, HelpIcon, PlayIcon, ResetIcon, SparkleIcon } from '@/components/ui/icons'
import { formatPython } from '@/lib/trace/format-python'
import { toast } from '@/lib/toast'
import type { LayoutState } from '@/lib/trace/workspace-layout'
import { CodeEditor } from './code-editor'
import { ReplayView } from './replay-view'
import { LiveResultsBody, ResultsBody } from './results-panel'
import { TeachingPanel } from './teaching-panel'
import { TutorPanel } from './tutor/tutor-panel'
import { useTutor } from './tutor/use-tutor'
import type { TutorContext as TutorRequestContext } from '@/lib/tutor/types'
import { Stopwatch } from './workspace/stopwatch'
import { TabList, panelId, tabId, type TabItem } from './workspace/tab-list'
import {
	WorkspaceLayout,
	type WorkspaceLabels,
	type WorkspaceLayoutApi
} from './workspace/workspace-layout'
import { WorkspaceTour } from './workspace/workspace-tour'
import './semantic-tokens.css'
import styles from './practice.module.css'
import wsStyles from './workspace/workspace.module.css'
import { TraceLoader } from '@/components/ui/trace-loader'
import { BrandMark } from '@/components/ui/brand-mark'

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
	isAuthenticated = false,
	userId = null,
	initialLayout,
	guestHeader = null,
	serverProblem = null
}: {
	slug: string
	isAuthenticated?: boolean
	userId?: string | null
	initialLayout: LayoutState
	// The top bar a signed-out visitor sees, rendered on the server (the landing header).
	guestHeader?: ReactNode
	// A published Daily Exam problem, supplied by the server (it is not in the static catalog).
	// Its tests are the PUBLIC practice set only; hidden cases never reach the browser.
	serverProblem?: ProblemDefinition | null
}) {
	const problem = PROBLEMS[slug] ?? serverProblem
	if (problem == null) return null
	return (
		// Keyed by slug so switching problems always starts a fresh workspace (editor,
		// results, replay and the Tracy chat), whether or not the router would have
		// reused the instance. Nothing from one problem can leak into the next.
		<ProblemWorkspace
			key={problem.slug}
			problem={problem}
			isAuthenticated={isAuthenticated}
			userId={userId}
			initialLayout={initialLayout}
			guestHeader={guestHeader}
		/>
	)
}

const LEFT_TABS: readonly TabItem[] = [
	{ id: 'description', label: 'Description' },
	{ id: 'hints', label: 'Hints' },
	{ id: 'history', label: 'History' }
]
const RESULT_TABS: readonly TabItem[] = [
	{ id: 'tests', label: 'Test results' },
	{ id: 'replay', label: 'Replay' }
]
const LABELS: WorkspaceLabels = {
	collapseChallenge: 'Collapse challenge pane',
	expandChallenge: 'Expand challenge pane',
	collapseResults: 'Collapse results pane',
	collapseCode: 'Collapse code pane',
	expandCode: 'Expand code pane',
	expandResults: 'Expand results pane',
	maximizeChallenge: 'Maximize challenge pane',
	maximizeCode: 'Maximize code pane',
	maximizeResults: 'Maximize results pane',
	restore: 'Restore layout',
	resizeVertical: 'Resize challenge and code panes',
	resizeHorizontal: 'Resize code and results panes',
	views: 'Practice views',
	viewProblem: 'Problem',
	viewCode: 'Code',
	viewResults: 'Results',
	challenge: 'Challenge',
	results: 'Results',
	// User-facing labels for the layout. Internal identifiers (component
	// names, API route, DB columns) still use "tutor" — this is a
	// branding-only rename to "Tracy" (M8 final refinement).
	tutor: 'Tracy',
	resizeTutor: 'Resize code and Tracy panes'
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
	isAuthenticated,
	userId,
	initialLayout,
	guestHeader
}: {
	problem: ProblemDefinition
	isAuthenticated: boolean
	userId: string | null
	initialLayout: LayoutState
	guestHeader: ReactNode
}) {
	const router = useRouter()
	const meta = problemMeta(problem)
	const [code, setCode] = useState(problem.starter)
	const [submitted, setSubmitted] = useState<{
		source: string
		result: RunResult
		// Tests the worker reported before a run that ended without a result (timeout, engine
		// error). Display only — a completed run's `result` is the only truth.
		streamed?: readonly TestResult[]
	} | null>(null)
	// The run in progress, built from the worker's per-test events. Null when nothing is running.
	const [liveRun, setLiveRun] = useState<LiveRun | null>(null)
	const [attempts, setAttempts] = useState<LocalAttempt[]>([])
	const [replayRecords, setReplayRecords] = useState<ReplayRecord[]>([])
	const [replay, setReplay] = useState<ReplayState | null>(null)
	const [status, setStatus] = useState<{ busy: boolean; label: string }>({ busy: false, label: '' })
	const [notice, setNotice] = useState('')
	const [leftTab, setLeftTab] = useState('description')
	const [resultsTab, setResultsTab] = useState('tests')
	const [replayStep, setReplayStep] = useState(0)
	const [tourSignal, setTourSignal] = useState(0)
	const [cursor, setCursor] = useState({ line: 1, column: 1 })
	// The AI Tutor is closed on every visit; opening it never touches the
	// editor, the results or the replay, which all live in this component.
	// Nothing is sent to the AI provider until the learner presses Send
	// (specs/features/contextual-ai-tutor.md AC1 — privacy boundary).
	const [tutorOpen, setTutorOpen] = useState(false)

	// Assemble the evidence payload only at send time: the hook holds a ref
	// to this function and calls it inside `send`, so a keystroke in the
	// editor does not re-trigger anything on the panel.
	const buildTutorContext = (): TutorRequestContext => {
		const ctx: TutorRequestContext = { code }
		if (submitted != null) {
			ctx.runSummary = {
				status: submitted.result.status,
				passed: submitted.result.tests.filter((t) => t.passed).length,
				total: submitted.result.tests.length
			}
			ctx.stale = submitted.source !== code
			// TestResult carries no args — look them up from the catalog by testId
			// (args are static per problem, so this never fabricates inputs).
			// `expected` / `actual` are Values (engine wire shape); format them to
			// Python-readable strings so the tutor sees `True` / `[0, 2]` not the
			// raw `{kind:'bool', value:true}` envelope.
			const argsById = new Map(problem.tests.map((t) => [t.id, t.args]))
			const failed = submitted.result.tests
				.filter((t) => !t.passed)
				.slice(0, 3)
				.map((t) => ({
					id: t.testId,
					args: argsById.get(t.testId) ?? [],
					expected: formatValue(t.expected),
					actual: t.actual !== undefined ? formatValue(t.actual) : undefined,
					error: t.error != null ? { type: t.error.type, message: t.error.message } : undefined
				}))
			if (failed.length > 0) ctx.failedTests = failed as TutorRequestContext['failedTests']
		}
		if (replay != null && replay.trace.steps.length > 0) {
			const step = replay.trace.steps[Math.min(replayStep, replay.trace.steps.length - 1)]
			if (step != null) {
				const locals: Record<string, string> = {}
				for (const [name, val] of Object.entries(step.locals).slice(0, 12)) {
					try {
						locals[name] = formatValue(val)
					} catch {
						locals[name] = String(val)
					}
				}
				ctx.replay = {
					line: step.line,
					locals,
					sourceLine: replay.trace.source[step.line - 1] ?? undefined
				}
			}
		}
		return ctx
	}

	const tutor = useTutor({
		userId: userId ?? null,
		problemSlug: problem.slug,
		buildContext: buildTutorContext
	})

	// Suggestions depend on live state: show "Explain my failing test" only
	// when the last run actually has a failure.
	const tutorSuggestions = (() => {
		const list: { id: string; label: string; prompt: string }[] = []
		if (submitted != null && submitted.result.tests.some((t) => !t.passed)) {
			list.push({
				id: 'explain-failure',
				label: 'Explain my failing test',
				prompt:
					'Why is my current code failing the tests? Use my actual code and the failing test cases.'
			})
		}
		if (replay != null) {
			list.push({
				id: 'walk-step',
				label: 'Walk me through this replay step',
				prompt:
					'Walk me through the selected replay step. What does this line do, and are the variables where you would expect?'
			})
		}
		list.push({
			id: 'approach',
			label: 'Hint about my approach',
			prompt:
				'Can you give me a conceptual hint about my approach without giving away the solution?'
		})
		// Topic teaching chip. The tutor must teach the concepts behind the
		// current problem from first principles when asked (M8 topic-teaching
		// clarification); surfacing a concrete prompt makes that visible without
		// forcing the learner to phrase it themselves. The topic is chosen from
		// the problem's own `conceptTags`, which are what the catalog already
		// labels it with.
		const topic = problem.conceptTags[0]
		if (topic != null) {
			list.push({
				id: 'teach-topic',
				label: `Teach me about ${topic}`,
				prompt: `Can you teach me about ${topic} from first principles? Use a small example or short pseudocode, and after the explanation briefly connect it back to this problem — without writing the full solution.`
			})
		}
		return list
	})()

	// Start the Python download as the page opens (fail-and-replay AC1), so the
	// first Run doesn't wait on it. Fire-and-forget: a failed warm-up just
	// leaves the first Run to load Pyodide itself, with its own error handling.
	useEffect(() => {
		void warmUpEngine()
	}, [])
	const layoutApiRef = useRef<WorkspaceLayoutApi>(null)
	const editorPanelRef = useRef<HTMLDivElement>(null)
	const busyRef = useRef(false)
	// Local attempt ids only need to be unique within this page's session.
	const attemptCounter = useRef(0)
	const tokenRef = useRef(0)

	const busy = status.busy

	// Events from a run that has been left behind (the page unmounted mid-run) are ignored.
	useEffect(
		() => () => {
			tokenRef.current += 1
		},
		[]
	)

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

	// Puts the four panes (challenge, code, results, Tracy) back to their default
	// sizes and un-maximizes. It clears nothing: code, results, replay, History,
	// the Tracy chat and the stopwatch are all left exactly as they are.
	function resetLayout() {
		layoutApiRef.current?.reset()
	}

	function closeTutor() {
		setTutorOpen(false)
		// Hand focus back to the button that opens it.
		requestAnimationFrame(() => document.getElementById('tutor-toggle')?.focus())
	}

	// Format fixes indentation only, and always says what it did: a button that
	// silently does nothing reads as broken.
	function formatCode() {
		const result = formatPython(code)
		if (result.status === 'error') {
			toast({
				title: "Couldn't format yet",
				description:
					result.reason === 'missing-indent'
						? `Line ${result.line} needs to be indented under the line above it.`
						: `Line ${result.line} is indented to a level no open block uses. Fix that line by hand first.`,
				variant: 'destructive'
			})
			return
		}
		if (result.status === 'unchanged') {
			toast({ description: 'Indentation already looks right.' })
			return
		}
		setCode(result.text)
		toast({ description: 'Indentation fixed.', variant: 'success' })
	}

	async function runTests() {
		if (code.trim() === '') {
			setNotice('Write some code before running the tests.')
			return
		}
		const source = code
		// The run's id is the engine token withEngine hands out; 0 means it never started.
		const run: { id: number; live: LiveRun | null } = { id: 0, live: null }
		const result = await withEngine('Running tests…', (onStatus) => {
			run.id = tokenRef.current
			run.live = startLiveRun(
				run.id,
				problem.tests.map((test) => test.id)
			)
			// Tests opens as the run begins. Nothing switches tabs again when it ends, so a tab the
			// learner picks meanwhile is theirs to keep.
			setResultsTab('tests')
			layoutApiRef.current?.revealResults()
			setLiveRun(run.live)
			return runCode(buildRunRequest(problem, source, { timeoutMs: RUN_TIMEOUT_MS }), {
				onStatus,
				onTestResult: (index, test) => {
					if (tokenRef.current !== run.id) return
					run.live = acceptTestResult(run.live, run.id, index, test)
					setLiveRun(run.live)
				}
			})
		})
		const streamed = run.live?.results ?? []
		setLiveRun((current) => (current != null && current.runId === run.id ? null : current))
		if (result == null) return
		setReplay(null)
		setSubmitted({
			source,
			result,
			streamed: result.status === 'completed' ? undefined : streamed
		})
		attemptCounter.current += 1
		const localId = `a${attemptCounter.current}`
		const saving = persistAttempt(localId, source, result)
		setAttempts((prev) => [
			...prev,
			{ id: localId, createdAt: new Date().toISOString(), source, result, saving }
		])
		if (result.status === 'timeout') setNotice('Execution timed out. Check for an infinite loop.')
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
		setReplayStep(0)
		setResultsTab('replay')
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

	const busyOrStatus = busy ? status.label : 'Ready'
	const statusText =
		busy || submitted == null || submitted.result.status !== 'completed'
			? busyOrStatus
			: `${submitted.result.tests.filter((t) => t.passed).length} / ${submitted.result.tests.length} passed`

	// What the status bar says about saving. Only runs are saved (the editor
	// itself never is), so this describes the latest run against the editor.
	const latestAttempt = attempts.at(-1)
	const saveState = !isAuthenticated
		? 'This session only · sign in to save'
		: latestAttempt == null
			? 'Not run yet'
			: code !== latestAttempt.source
				? 'Edited since last run'
				: latestAttempt.synced === true
					? 'Saved'
					: 'Last run not saved yet'

	const hintsReady = teaching != null || challenge != null
	const leftTabs = LEFT_TABS.map((tab) => ({ ...tab, dot: tab.id === 'hints' && hintsReady }))
	const resultTabs = RESULT_TABS.map((tab) => ({
		...tab,
		dot: tab.id === 'replay' && showReplayNudge
	}))
	// What the results header says while tests are still executing: the events received so far.
	const liveSummary =
		liveRun == null
			? null
			: `${liveRun.results.filter((t) => t.passed).length} / ${liveRun.testIds.length} passed so far`
	const resultSummary =
		submitted == null
			? 'Not run yet'
			: submitted.result.status === 'completed'
				? `${submitted.result.tests.filter((t) => t.passed).length} / ${submitted.result.tests.length} passed`
				: submitted.result.status

	return (
		<div className={cn(styles.page, styles.workspacePage)} data-workspace>
			{isAuthenticated ? (
				<header className={styles.top}>
					<Link className={styles.brand} href="/">
						<BrandMark tone="light" /> tracecode<span className={styles.dot}>.</span>
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
						<Link className={styles.topLink} href="/dashboard">
							Overview
						</Link>
					</div>
				</header>
			) : (
				// A guest gets the landing header itself (brand, Sign in, Register), server-rendered.
				guestHeader
			)}

			<div className={styles.toolbar}>
				<div className={styles.stages} role="list" aria-label="Learning journey">
					{STAGES.map((label, i) => (
						<div
							key={label}
							role="listitem"
							aria-current={i === stageIndex ? 'step' : undefined}
							className={cn(styles.stage, i === stageIndex && styles.stageActive)}
						>
							{label}
						</div>
					))}
				</div>
				<span className={styles.toolbarSpacer} />
				<button
					id="tutor-toggle"
					type="button"
					className={cn(styles.btn, tutorOpen && styles.btnActive)}
					aria-pressed={tutorOpen}
					aria-expanded={tutorOpen}
					aria-controls="pane-tutor"
					onClick={() => (tutorOpen ? closeTutor() : setTutorOpen(true))}
				>
					<SparkleIcon size={16} /> Ask Tracy
				</button>
				<Stopwatch
					labels={{
						timer: 'Stopwatch',
						start: 'Start stopwatch',
						pause: 'Pause stopwatch',
						reset: 'Reset stopwatch'
					}}
				/>
				<button
					type="button"
					id="reset-practice"
					className={wsStyles.helpButton}
					aria-label="Reset layout"
					title="Reset layout (pane sizes)"
					onClick={resetLayout}
				>
					<ResetIcon size={18} />
				</button>
				<button
					type="button"
					className={wsStyles.helpButton}
					aria-label="Show the workspace tour"
					onClick={() => setTourSignal((n) => n + 1)}
				>
					<HelpIcon size={18} />
				</button>
			</div>

			<WorkspaceLayout
				initial={initialLayout}
				apiRef={layoutApiRef}
				labels={LABELS}
				resultsDot={submitted != null}
				tutorOpen={tutorOpen}
				renderTutor={({ mode, maximized, toggleMaximize }) => (
					<TutorPanel
						context={{
							problemTitle: problem.title,
							difficulty: problem.difficulty,
							topics: problem.conceptTags,
							runSummary: submitted == null ? null : resultSummary
						}}
						mode={mode}
						open={tutorOpen}
						maximized={maximized}
						onToggleMaximize={toggleMaximize}
						onClose={closeTutor}
						tutor={tutor}
						suggestions={tutorSuggestions}
					/>
				)}
				leftHead={
					<TabList
						id="tour-left-tabs"
						prefix="left"
						label="Challenge tabs"
						tabs={leftTabs}
						active={leftTab}
						onChange={setLeftTab}
					/>
				}
				leftBody={
					<>
						<div
							role="tabpanel"
							id={panelId('left', 'description')}
							aria-labelledby={tabId('left', 'description')}
							hidden={leftTab !== 'description'}
						>
							<div className={styles.problem}>
								<div className={styles.problemTitle}>
									<h1>{problem.title}</h1>
									<span className={styles.pill}>{problem.difficulty}</span>
								</div>
								<p>
									{problem.conceptTags.map((tag) => (
										<span key={tag} className={styles.pill} style={{ marginRight: 6 }}>
											{tag}
										</span>
									))}
								</p>
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
								<div className={styles.foot}>
									First-load internet access is required for the Pyodide runtime. Python executes
									locally in a browser Web Worker; worker timeout and trace length are bounded. This
									is not a hardened security sandbox.
								</div>
							</div>
						</div>

						<div
							role="tabpanel"
							id={panelId('left', 'hints')}
							aria-labelledby={tabId('left', 'hints')}
							hidden={leftTab !== 'hints'}
							className={wsStyles.pad}
						>
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
										{new Date(solvedAttempt.createdAt).toLocaleTimeString()}). That solution stays
										saved in your attempts, and trying something else never unsolves this problem.
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
							{!hintsReady && (
								<p className={styles.description}>
									Hints unlock after you replay a failing test, so they point at what your code
									actually did. Run your code first.
								</p>
							)}
						</div>

						<div
							role="tabpanel"
							id={panelId('left', 'history')}
							aria-labelledby={tabId('left', 'history')}
							hidden={leftTab !== 'history'}
							className={wsStyles.pad}
						>
							{attempts.length === 0 ? (
								<p className={styles.description}>
									No attempts yet. Each run is listed here with its result, and you can load its
									code back into the editor.
								</p>
							) : (
								<>
									<div className={styles.progressGrid} style={{ padding: 0, marginBottom: 12 }}>
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
									<p className={styles.description} style={{ marginBottom: 8 }}>
										{isAuthenticated
											? 'Signed in · saved to your account'
											: 'This session only · sign in to save'}
									</p>
									<div className={styles.progressList} style={{ padding: 0 }}>
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
								</>
							)}
						</div>
					</>
				}
				codeHead={
					<>
						<div className={wsStyles.fileChip}>
							<span className={styles.py}>Py</span> {problem.entry}.py
						</div>
						<span className={wsStyles.status} role="status" aria-live="polite">
							{busy && (
								<TraceLoader
									tone="dark"
									width={32}
									className="-my-1 mr-2 inline-block align-middle"
								/>
							)}
							<b>{statusText}</b>
						</span>
						<button
							type="button"
							className={wsStyles.codeIcon}
							aria-label="Format code"
							title="Format code (fix indentation)"
							onClick={formatCode}
							disabled={busy}
						>
							<FormatIcon size={16} />
						</button>
						<button
							type="button"
							className={wsStyles.codeIcon}
							aria-label="Reset code"
							title="Reset code"
							onClick={() => setCode(problem.starter)}
							disabled={busy}
						>
							<ResetIcon size={16} />
						</button>
						<button
							type="button"
							id="tour-run"
							className={cn(wsStyles.codeIcon, wsStyles.codeRun)}
							aria-label="Run code"
							title="Run code"
							onClick={runTests}
							disabled={busy}
						>
							<PlayIcon size={16} />
						</button>
					</>
				}
				codeBody={
					<div ref={editorPanelRef} style={{ height: '100%' }}>
						<CodeEditor
							value={code}
							onChange={setCode}
							onCursorChange={(line, column) => setCursor({ line, column })}
						/>
					</div>
				}
				codeFoot={
					<div className={wsStyles.editorStatus}>
						<span>{saveState}</span>
						<span aria-label={`Line ${cursor.line}, column ${cursor.column}`}>
							Ln {cursor.line}, Col {cursor.column}
						</span>
					</div>
				}
				resultsHead={
					<>
						<TabList
							id="tour-results-tabs"
							prefix="results"
							label="Results tabs"
							tabs={resultTabs}
							active={resultsTab}
							onChange={setResultsTab}
						/>
						<span className={wsStyles.summary}>{liveSummary ?? resultSummary}</span>
					</>
				}
				resultsBody={
					<>
						<div
							role="tabpanel"
							id={panelId('results', 'tests')}
							aria-labelledby={tabId('results', 'tests')}
							hidden={resultsTab !== 'tests'}
						>
							{notice !== '' && <p className={styles.warn}>{notice}</p>}
							{showReplayNudge && (
								<div className={styles.replayNudge}>
									Your answer did not pass all tests. <strong>Replay a failing test</strong> to see
									what your code actually did before changing it.
								</div>
							)}
							{liveRun != null ? (
								<LiveResultsBody run={liveRun} problem={problem} namedInput={namedInput} />
							) : submitted == null ? (
								<div className={styles.empty}>
									Run your solution to see real Python test results.
								</div>
							) : (
								<ResultsBody
									result={submitted.result}
									streamed={submitted.streamed}
									problem={problem}
									busy={busy}
									namedInput={namedInput}
									onReplay={(t) => replayOfficial(t, submitted.source, attempts.length - 1)}
								/>
							)}
						</div>
						<div
							role="tabpanel"
							id={panelId('results', 'replay')}
							aria-labelledby={tabId('results', 'replay')}
							hidden={resultsTab !== 'replay'}
							style={{ height: '100%' }}
						>
							{replay == null ? (
								<div className={styles.empty}>
									Replay a test to step through it line by line and watch its variables. Pick Replay
									on any result.
								</div>
							) : (
								<ReplayView
									part="pane"
									step={replayStep}
									onStepChange={setReplayStep}
									trace={replay.trace}
									meta={meta}
									label={replay.label}
									kind={replay.kind}
								/>
							)}
						</div>
					</>
				}
			/>
			<WorkspaceTour openSignal={tourSignal} />
		</div>
	)
}
