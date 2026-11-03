'use client'

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
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
import { FormatIcon, HelpIcon, PlayIcon, ResetIcon } from '@/components/ui/icons'
import { formatPython } from '@/lib/trace/format-python'
import {
	DRAFT_DEBOUNCE_MS,
	browserStorage,
	clearDraft,
	readDraft,
	writeDraft
} from '@/lib/trace/editor-drafts'
import { detectPlatform, matchShortcut, shortcutKeys, type Platform } from '@/lib/trace/shortcuts'
import { COMPARISON_ARGS, type ReferenceSolution } from '@/lib/trace/reference-solutions'
import {
	comparisonTarget,
	shownSolutions,
	solutionsAccess,
	type StepCount
} from '@/lib/trace/solutions'
import { toast } from '@/lib/toast'
import type { LayoutState } from '@/lib/trace/workspace-layout'
import { CodeEditor } from './code-editor'
import { ReplayView } from './replay-view'
import { TeachingPanel } from './teaching-panel'
import { SolutionsPanel } from './solutions-panel'
import { Stopwatch } from './workspace/stopwatch'
import { TabList, panelId, tabId, type TabItem } from './workspace/tab-list'
import { WorkspaceLayout, type WorkspaceLabels } from './workspace/workspace-layout'
import { WorkspaceTour } from './workspace/workspace-tour'
import { ShortcutsDialog } from './workspace/shortcuts-dialog'
import styles from './practice.module.css'
import wsStyles from './workspace/workspace.module.css'

const RUN_TIMEOUT_MS = 5000

// The platform decides which shortcut keys tooltips name. Unknown on the
// server, so the server snapshot is 'other' and the browser swaps in the real
// one after hydration (no mismatch).
const noSubscription = () => () => {}
const clientPlatform = (): Platform => detectPlatform(navigator.userAgent)
const serverPlatform = (): Platform => 'other'

function isTextField(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
	)
}
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
	kind: 'official' | 'custom' | 'solution'
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
	initialLayout
}: {
	slug: string
	isAuthenticated?: boolean
	initialLayout: LayoutState
}) {
	const problem = PROBLEMS[slug]
	if (problem == null) return null
	// Keyed by problem, so switching problems starts from that problem's own
	// code and draft, never the previous one's state.
	return (
		<ProblemWorkspace
			key={problem.slug}
			problem={problem}
			isAuthenticated={isAuthenticated}
			initialLayout={initialLayout}
		/>
	)
}

const LEFT_TABS: readonly TabItem[] = [
	{ id: 'description', label: 'Description' },
	{ id: 'hints', label: 'Hints' },
	{ id: 'history', label: 'History' },
	{ id: 'solutions', label: 'Solutions' }
]
const RESULT_TABS: readonly TabItem[] = [
	{ id: 'tests', label: 'Test results' },
	{ id: 'replay', label: 'Replay' }
]
const LABELS: WorkspaceLabels = {
	collapseChallenge: 'Collapse challenge pane',
	expandChallenge: 'Expand challenge pane',
	collapseResults: 'Collapse results pane',
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
	results: 'Results'
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
	initialLayout
}: {
	problem: ProblemDefinition
	isAuthenticated: boolean
	initialLayout: LayoutState
}) {
	const router = useRouter()
	const meta = problemMeta(problem)
	// specs/features/editor-drafts.md. The editor shows the learner's own edits
	// once they make one; before that, the draft saved in this browser; before
	// that, the starter. The draft is read as external state, so the server (which
	// can't see browser storage) renders the starter and the browser swaps the
	// draft in after hydration, with no mismatch.
	const storedDraft = useSyncExternalStore(
		noSubscription,
		() => readDraft(browserStorage(), problem.slug)?.code ?? null,
		() => null
	)
	const [edited, setCode] = useState<string | null>(null)
	const code = edited ?? storedDraft ?? problem.starter
	const [submitted, setSubmitted] = useState<{ source: string; result: RunResult } | null>(null)
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
	// The editor is showing a saved draft the learner hasn't touched yet (AC2).
	const restoredDraft = edited == null && storedDraft != null
	const [shortcutsOpen, setShortcutsOpen] = useState(false)
	// specs/features/solutions-tab.md, AC3: a stuck learner chose to reveal them.
	const [solutionsRevealed, setSolutionsRevealed] = useState(false)
	const platform = useSyncExternalStore(noSubscription, clientPlatform, serverPlatform)

	// Save the draft shortly after typing stops (AC1, AC5). Nothing is written
	// until the learner edits, so opening a problem never touches storage.
	useEffect(() => {
		if (edited == null) return
		const timer = setTimeout(
			() => writeDraft(browserStorage(), problem.slug, edited, problem.starter),
			DRAFT_DEBOUNCE_MS
		)
		return () => clearTimeout(timer)
	}, [edited, problem.slug, problem.starter])

	// ...and immediately when the page is hidden or the workspace unmounts, so the
	// last half-second of typing is never lost to the debounce.
	const flushDraft = useEffectEvent(() => {
		if (edited != null) writeDraft(browserStorage(), problem.slug, edited, problem.starter)
	})
	useEffect(() => {
		const onHide = () => flushDraft()
		window.addEventListener('pagehide', onHide)
		return () => {
			window.removeEventListener('pagehide', onHide)
			flushDraft()
		}
	}, [])

	// Start the Python download as the page opens (fail-and-replay AC1), so the
	// first Run doesn't wait on it. Fire-and-forget: a failed warm-up just
	// leaves the first Run to load Pyodide itself, with its own error handling.
	useEffect(() => {
		void warmUpEngine()
	}, [])
	const editorPanelRef = useRef<HTMLDivElement>(null)
	const busyRef = useRef(false)
	// Local attempt ids only need to be unique within this page's session.
	const attemptCounter = useRef(0)
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

	// Reset code: back to the starter, and the draft is gone (editor-drafts AC3).
	function resetCode() {
		setCode(problem.starter)
		clearDraft(browserStorage(), problem.slug)
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
		setResultsTab('tests')
		setSubmitted({ source, result })
		attemptCounter.current += 1
		const localId = `a${attemptCounter.current}`
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
		setReplayStep(0)
		setResultsTab('replay')
		setReplayRecords((prev) => [...prev, { attemptIndex, testPassed: tr?.passed === true }])
		const attempt = attemptIndex >= 0 ? attempts[attemptIndex] : attempts.at(-1)
		void persistReplay(attempt, test.id, tr?.passed === true)
	}

	// specs/features/solutions-tab.md, AC6: trace a reference solution on the
	// problem's first example and show it in the replay pane.
	async function watchSolution(solution: ReferenceSolution) {
		const args = problem.examples[0]?.args ?? problem.tests[0]?.args ?? []
		const result = await withEngine('Replaying…', (onStatus) =>
			traceCode(
				{
					code: solution.source,
					entry: problem.entry,
					input: { args },
					limits: { maxSteps: DEFAULT_LIMITS.maxSteps, timeoutMs: RUN_TIMEOUT_MS }
				},
				{ onStatus }
			)
		)
		if (result == null) return
		if (result.status !== 'completed' || result.trace == null) {
			setNotice(`Could not replay ${solution.name} (${result.status}).`)
			return
		}
		setReplay({
			kind: 'solution',
			label: `${solution.name} · ${labelFor(args)}`,
			source: solution.source,
			trace: result.trace,
			outcome: null
		})
		setReplayStep(0)
		setResultsTab('replay')
	}

	// AC7, AC8: how many steps a source takes on the comparison input, or null
	// when it can't be traced (AC9).
	async function measureSteps(source: string): Promise<StepCount | null> {
		const args = COMPARISON_ARGS[problem.slug]
		if (args == null) return null
		const result = await withEngine('Comparing…', (onStatus) =>
			traceCode(
				{
					code: source,
					entry: problem.entry,
					input: { args },
					limits: { maxSteps: DEFAULT_LIMITS.maxSteps, timeoutMs: RUN_TIMEOUT_MS }
				},
				{ onStatus }
			)
		)
		if (result == null || result.status !== 'completed' || result.trace == null) return null
		return { steps: result.trace.steps.length, truncated: result.trace.truncated }
	}

	// specs/features/workspace-shortcuts.md. One page-level listener; the event
	// handler always sees the current code and busy state.
	const onShortcut = useEffectEvent((event: KeyboardEvent) => {
		// Another dialog (the tour, the shortcuts list) owns the keyboard (edge case).
		if (document.querySelector('dialog[open], [role="dialog"]') != null) return
		const action = matchShortcut(
			{
				key: event.key,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				shiftKey: event.shiftKey,
				altKey: event.altKey,
				inTextField: isTextField(event.target)
			},
			platform
		)
		if (action == null) return
		event.preventDefault()
		if (action === 'help') setShortcutsOpen(true)
		// A run already in progress ignores the shortcut, like the disabled button (AC2).
		else if (busyRef.current) return
		else if (action === 'run') void runTests()
		else formatCode()
	})
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => onShortcut(event)
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

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

	const failedRuns = attempts.filter((a) => !allPassed(a.result)).length
	const access = solutionsAccess({
		solved: solvedAttempt != null,
		failedRuns,
		revealed: solutionsRevealed
	})
	const latestPassing = attempts.findLast((a) => allPassed(a.result))

	const hintsReady = teaching != null || challenge != null
	const leftTabs = LEFT_TABS.map((tab) => ({ ...tab, dot: tab.id === 'hints' && hintsReady }))
	const resultTabs = RESULT_TABS.map((tab) => ({
		...tab,
		dot: tab.id === 'replay' && showReplayNudge
	}))
	const resultSummary =
		submitted == null
			? 'Not run yet'
			: submitted.result.status === 'completed'
				? `${submitted.result.tests.filter((t) => t.passed).length} / ${submitted.result.tests.length} passed`
				: submitted.result.status

	return (
		<div className={cn(styles.page, styles.workspacePage)} data-workspace>
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
					className={wsStyles.helpButton}
					aria-label="Show the workspace tour"
					onClick={() => setTourSignal((n) => n + 1)}
				>
					<HelpIcon size={18} />
				</button>
			</div>

			<WorkspaceLayout
				initial={initialLayout}
				labels={LABELS}
				resultsDot={submitted != null}
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

						<div
							role="tabpanel"
							id={panelId('left', 'solutions')}
							aria-labelledby={tabId('left', 'solutions')}
							hidden={leftTab !== 'solutions'}
							className={wsStyles.pad}
						>
							<SolutionsPanel
								access={access}
								failedRuns={failedRuns}
								solutions={shownSolutions(problem.slug)}
								optimised={comparisonTarget(problem.slug)}
								passedSource={latestPassing?.source ?? null}
								busy={busy}
								onReveal={() => setSolutionsRevealed(true)}
								onWatch={watchSolution}
								measure={measureSteps}
							/>
						</div>
					</>
				}
				codeHead={
					<>
						<div className={wsStyles.fileChip}>
							<span className={styles.py}>Py</span> {problem.entry}.py
						</div>
						<span className={wsStyles.status} role="status" aria-live="polite">
							<b>{statusText}</b>
						</span>
						<button
							type="button"
							className={wsStyles.codeIcon}
							aria-label="Format code"
							aria-keyshortcuts="Shift+Alt+F"
							title={`Format code: fix indentation (${shortcutKeys('format', platform)})`}
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
							onClick={resetCode}
							disabled={busy}
						>
							<ResetIcon size={16} />
						</button>
						<button
							type="button"
							id="tour-run"
							className={cn(wsStyles.codeIcon, wsStyles.codeRun)}
							aria-label="Run code"
							aria-keyshortcuts="Control+Enter Meta+Enter"
							title={`Run code (${shortcutKeys('run', platform)})`}
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
						<span>
							{restoredDraft ? 'Restored your last edit · ' : ''}
							{saveState}
						</span>
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
						<span className={wsStyles.summary}>{resultSummary}</span>
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
			<ShortcutsDialog
				open={shortcutsOpen}
				platform={platform}
				onClose={() => setShortcutsOpen(false)}
			/>
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
