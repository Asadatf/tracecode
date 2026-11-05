'use client'

import {
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent
} from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { PlayIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { CodeEditor } from '@/components/trace/code-editor'
import { runCode } from '@/lib/trace/run-code'
import type { RunResult } from '@/lib/trace/contract'
import { exampleRunRequest, type ExamProblem } from '@/lib/challenge/exam-problem'
import { DAILY_TARGET_MS, dailyClock, formatClock } from '@/lib/challenge/daily'
import type { AttemptView } from '@/lib/challenge/service'
import type { Assessment } from '@/lib/challenge/assessment'
import {
	assessDailyAction,
	challengeStatusAction,
	startChallengeAction,
	submitChallengeAction
} from '@/server/actions/challenge'
import practice from '@/components/trace/practice.module.css'
import ws from '@/components/trace/workspace/workspace.module.css'
import styles from './challenge.module.css'

// The Daily Learning Challenge (specs/features/daily-challenge.md): the statement, a code
// editor, a 30-minute TARGET timer, Run and ONE final Submit, and nothing that teaches or
// ranks: no Tracy, hints, replay, solutions or topic labels are rendered here at all.
//
// The 30 minutes is a soft target. The clock is derived from the server's recorded
// `startedAt` and the server's "now" at page load (never the browser's own date), so it
// survives refreshes. Past zero it shows Overtime; it never expires the challenge, never
// submits for the learner and never blocks Run or the final Submit. It stops at that
// Submit. Run tries the PUBLIC examples in the browser as feedback, unlimited. The final
// Submit sends only the source: the server grades it in a sandbox against the full hidden
// tests, and the page shows the verified counts. Nothing the browser reports is a result.

type Busy = null | 'starting' | 'running' | 'submitting'
type ErrorKey =
	null | 'generic' | 'unauthenticated' | 'notLive' | 'notStarted' | 'empty' | 'tooLarge'

const POLL_MS = 4000

const SPLIT_MIN = 25
const SPLIT_MAX = 60
const SPLIT_KEY_STEP = 2
const clampSplit = (value: number) => Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, value))

function draftKey(date: string): string {
	return `tracecode.challenge.draft.${date}`
}

// A draft survives a refresh through localStorage, read as an external store so the
// server render and the first client render agree (the server snapshot is null) and no
// state is set from an effect. Storage can be blocked; everything works without it.
function subscribeStorage(onChange: () => void): () => void {
	window.addEventListener('storage', onChange)
	return () => window.removeEventListener('storage', onChange)
}

function readDraft(date: string): string | null {
	try {
		return window.localStorage.getItem(draftKey(date))
	} catch {
		return null
	}
}

export function ChallengeExam({
	date,
	heading,
	problem,
	initial,
	initialAssessment,
	serverNow,
	gradingOn
}: {
	date: string
	// The long date shown in the toolbar.
	heading: string
	problem: ExamProblem
	initial: AttemptView | null
	initialAssessment: Assessment | null
	serverNow: string
	// Whether server grading is switched on. When it is not, a final submission is saved and
	// waits ("grading pending"); the page says so and does not poll for a result.
	gradingOn: boolean
}) {
	const t = useTranslations('Challenge')
	const [view, setView] = useState<AttemptView | null>(initial)
	const [assessment, setAssessment] = useState<Assessment | null>(initialAssessment)
	const [aiFailed, setAiFailed] = useState(false)
	const askedRef = useRef(false)
	// What the learner has typed this session (null until they type), over the stored draft.
	const [edited, setEdited] = useState<string | null>(null)
	const draft = useSyncExternalStore(
		subscribeStorage,
		() => readDraft(date),
		() => null
	)
	const [busy, setBusy] = useState<Busy>(null)
	const [error, setError] = useState<ErrorKey>(null)
	const [confirming, setConfirming] = useState(false)
	const [runResult, setRunResult] = useState<RunResult | null>(null)
	// Display-only clock: the server's "now" at page load, advanced by this browser's timer.
	const [offsetMs] = useState(() => Date.parse(serverNow) - Date.now())
	const [now, setNow] = useState(() => Date.parse(serverNow))
	// The problem pane's share of the width (percent). Dragging or the arrow keys move it.
	const [left, setLeft] = useState(38)
	const panesRef = useRef<HTMLDivElement>(null)

	const phase = view?.phase ?? null
	const clock = dailyClock(
		{ startedAt: view?.startedAt ?? null, submittedAt: view?.submittedAt ?? null },
		now
	)
	const open = phase === 'running'
	const pending = phase === 'submitted' || phase === 'grading' || phase === 'grader_error'
	const graded = phase === 'graded'
	const passedAll = graded && view?.testsPassed != null && view.testsPassed === view.testsTotal
	const code = edited ?? draft ?? problem.starter

	function changeCode(next: string) {
		setEdited(next)
		try {
			window.localStorage.setItem(draftKey(date), next)
		} catch {
			// Ignore a blocked or full store.
		}
	}

	// The countdown tick (display only). It stops once the final submission is made.
	useEffect(() => {
		if (!open) return
		const id = window.setInterval(() => setNow(Date.now() + offsetMs), 1000)
		return () => window.clearInterval(id)
	}, [open, offsetMs])

	// While the final submission waits for grading, poll the server (the poll also nudges a
	// stuck grading along). Not when grading is switched off: nothing can arrive.
	useEffect(() => {
		if (!gradingOn || !pending) return
		const id = window.setInterval(async () => {
			const result = await challengeStatusAction({ date })
			if (result.ok && result.data.ok) setView(result.data.view)
		}, POLL_MS)
		return () => window.clearInterval(id)
	}, [gradingOn, pending, date])

	// Once graded (pass or fail) and no assessment is stored yet, ask for it ONCE. The server
	// generates it at most once per submission, so a reload or a second tab spends nothing; a
	// failure leaves the result as it is with "feedback unavailable".
	useEffect(() => {
		if (!graded || assessment != null || askedRef.current) return
		askedRef.current = true
		void assessDailyAction({ date }).then(
			(result) => {
				if (result.ok && result.data.ok) setAssessment(result.data.assessment)
				else setAiFailed(true)
			},
			() => setAiFailed(true)
		)
	}, [graded, assessment, date])

	function apply(result: Awaited<ReturnType<typeof submitChallengeAction>>): boolean {
		if (result.ok && result.data.ok) {
			setView(result.data.view)
			setError(null)
			return true
		}
		const reason = result.ok && !result.data.ok ? result.data.error : null
		setError(
			reason === 'unauthenticated'
				? 'unauthenticated'
				: reason === 'not_live'
					? 'notLive'
					: reason === 'not_started'
						? 'notStarted'
						: reason === 'empty'
							? 'empty'
							: reason === 'too_large'
								? 'tooLarge'
								: 'generic'
		)
		return false
	}

	async function start() {
		setBusy('starting')
		apply(await startChallengeAction({ date }))
		setBusy(null)
	}

	async function run() {
		setBusy('running')
		setRunResult(null)
		try {
			setRunResult(await runCode(exampleRunRequest(problem, code)))
		} catch {
			setError('generic')
		}
		setBusy(null)
	}

	// The ONE final submission. Only the source is sent; the server decides everything else.
	async function submit() {
		setBusy('submitting')
		setConfirming(false)
		apply(await submitChallengeAction({ date, source: code }))
		setBusy(null)
	}

	const passedExamples = runResult?.tests.filter((r) => r.passed).length ?? 0
	const examples = problem.examples

	function dragSplitter(event: PointerEvent<HTMLButtonElement>) {
		const panes = panesRef.current
		if (panes == null || event.buttons !== 1) return
		const box = panes.getBoundingClientRect()
		setLeft(clampSplit(((event.clientX - box.left) / box.width) * 100))
	}

	function keySplitter(event: KeyboardEvent<HTMLButtonElement>) {
		if (event.key === 'ArrowLeft') setLeft((value) => clampSplit(value - SPLIT_KEY_STEP))
		else if (event.key === 'ArrowRight') setLeft((value) => clampSplit(value + SPLIT_KEY_STEP))
		else return
		event.preventDefault()
	}

	const statusText =
		busy === 'running' || busy === 'submitting'
			? t('submitting')
			: runResult == null
				? ''
				: runResult.status !== 'completed'
					? t('runProblem')
					: t('exampleResult', { passed: passedExamples, total: runResult.tests.length })

	return (
		<div className={cn(practice.page, practice.workspacePage)} data-workspace>
			<div className={practice.toolbar}>
				<div className={styles.toolbarTitle}>
					<span className={styles.toolbarEyebrow}>{t('eyebrow')}</span>
					<span className={styles.toolbarDate}>{heading}</span>
				</div>
				<span className={practice.toolbarSpacer} />
				{clock.phase === 'running' ? (
					<span className={styles.timer} role="timer" aria-label={t('timeLeftLabel')}>
						<span className={styles.timerLabel}>{t('timeLeft')}</span>
						<strong data-low={clock.remainingMs < 5 * 60_000 ? 'true' : undefined}>
							{formatClock(clock.remainingMs)}
						</strong>
					</span>
				) : null}
				{clock.phase === 'overtime' ? (
					<span
						className={cn(styles.timer, styles.timerOvertime)}
						role="timer"
						aria-label={t('overtimeLabel')}
					>
						<span className={styles.timerLabel}>{t('overtime')}</span>
						<strong>+{formatClock(clock.overtimeMs)}</strong>
					</span>
				) : null}
				{clock.phase === 'submitted' ? (
					<span
						className={cn(styles.timer, passedAll ? styles.timerDone : undefined)}
						role="status"
					>
						<span className={styles.timerLabel}>
							{passedAll ? '✓ ' : ''}
							{t('submittedBadge')}
						</span>
						<strong>{formatClock(clock.elapsedMs)}</strong>
					</span>
				) : null}
				{clock.phase === 'not_started' ? (
					<span className={styles.timer}>
						<span className={styles.timerLabel}>
							{t('targetLabel', { minutes: DAILY_TARGET_MS / 60000 })}
						</span>
					</span>
				) : null}
			</div>

			<div className={ws.workspace}>
				<div
					ref={panesRef}
					className={styles.panes}
					style={{ '--left': `${left}%` } as CSSProperties}
				>
					<section aria-labelledby="exam-title" className={ws.pane}>
						<div className={ws.paneHead}>
							<span className={styles.headTitle}>{t('problemPane')}</span>
						</div>
						<div className={cn(ws.paneBody, styles.problemBody)}>
							<h2 id="exam-title">{problem.title}</h2>
							{problem.statement.map((paragraph) => (
								<p key={paragraph}>{paragraph}</p>
							))}
							<h3>{t('examples')}</h3>
							{examples.map((example, index) => (
								<div key={index} className={styles.example}>
									{problem.entry}({example.args.map((arg) => JSON.stringify(arg)).join(', ')}) →{' '}
									{JSON.stringify(example.output)}
								</div>
							))}
						</div>
					</section>

					<button
						type="button"
						className={cn(ws.splitter, ws.splitterV, styles.splitter)}
						role="separator"
						aria-orientation="vertical"
						aria-label={t('resizePanes')}
						aria-valuemin={SPLIT_MIN}
						aria-valuemax={SPLIT_MAX}
						aria-valuenow={Math.round(left)}
						onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
						onPointerMove={dragSplitter}
						onKeyDown={keySplitter}
					/>

					<section aria-label={t('workArea')} className={cn(ws.pane, ws.paneCode)}>
						<div className={ws.paneHead}>
							<div className={ws.fileChip} style={{ paddingLeft: 10 }}>
								<span className={practice.py}>Py</span> {problem.entry}.py
							</div>
							<span className={styles.runStatus} role="status" aria-live="polite">
								<b>{statusText}</b>
							</span>
							{open ? (
								<button
									type="button"
									className={cn(ws.codeIcon, ws.codeRun)}
									aria-label={t('run')}
									title={t('run')}
									disabled={busy != null}
									onClick={run}
								>
									<PlayIcon size={16} />
								</button>
							) : null}
						</div>

						<div className={ws.paneBody}>
							{phase == null ? (
								<div className={styles.dark}>
									<h3>{t('rules.heading')}</h3>
									<ul className={styles.rules}>
										<li>{t('rules.time', { minutes: DAILY_TARGET_MS / 60000 })}</li>
										<li>{t('rules.run')}</li>
										<li>{t('rules.once')}</li>
										<li>{t('rules.hidden')}</li>
										<li>{t('rules.noHelp')}</li>
										<li>{t('rules.personal')}</li>
									</ul>
									<Button type="button" disabled={busy != null} onClick={start}>
										{busy === 'starting' ? t('starting') : t('start')}
									</Button>
								</div>
							) : null}

							{open ? (
								<div className={styles.editorFill}>
									<CodeEditor value={code} onChange={changeCode} ariaLabel={t('editor')} />
								</div>
							) : null}

							{pending ? (
								<div className={styles.dark} role="status" aria-live="polite">
									<h3>{t('pendingHeading')}</h3>
									<p>{phase === 'grading' ? t('grading') : t('pending')}</p>
								</div>
							) : null}

							{graded && view != null ? (
								<div className={styles.dark} role="status" aria-live="polite">
									<h3 className={passedAll ? styles.doneHeading : undefined}>
										{passedAll ? `✓ ${t('passedHeading')}` : t('failedHeading')}
									</h3>
									<p>
										<strong>
											{t('resultCounts', {
												passed: view.testsPassed ?? 0,
												total: view.testsTotal ?? 0
											})}
										</strong>
									</p>
									<p>
										{passedAll
											? t('passedBody', { time: formatClock(clock.elapsedMs) })
											: t('failedBody')}
									</p>
									<p className={styles.muted}>
										{t('timeTaken', { time: formatClock(clock.elapsedMs) })}
									</p>
									<div className={styles.assessment} aria-live="polite">
										<strong>{t('assessment.heading')}</strong>{' '}
										<span className={styles.badge}>{t('assessment.badge')}</span>
										{assessment == null ? (
											<p className={styles.muted}>
												{aiFailed ? t('assessment.unavailable') : t('assessment.loading')}
											</p>
										) : (
											<>
												<p>{t('assessment.approach', { approach: assessment.approach })}</p>
												<p>
													{t('assessment.time', { time: assessment.timeComplexity })} ·{' '}
													{t('assessment.space', { space: assessment.spaceComplexity })} ·{' '}
													{t('assessment.efficiency', {
														level: t(`assessment.levels.${assessment.efficiency}`)
													})}
												</p>
												<p>
													{t('assessment.improvement', { improvement: assessment.improvement })}
												</p>
												<p className={styles.muted}>{t('assessment.disclaimer')}</p>
											</>
										)}
									</div>
								</div>
							) : null}

							{error != null ? (
								<div className={styles.dark}>
									<p role="alert" className={styles.error}>
										{t(`errors.${error}`)}
									</p>
								</div>
							) : null}
						</div>

						{open ? (
							<div className={styles.foot}>
								{confirming ? (
									<>
										<p role="alert" className={styles.confirm}>
											{t('confirmText')}
										</p>
										<Button type="button" size="sm" disabled={busy != null} onClick={submit}>
											{busy === 'submitting' ? t('submitting') : t('confirmSubmit')}
										</Button>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onClick={() => setConfirming(false)}
										>
											{t('cancel')}
										</Button>
									</>
								) : (
									<>
										<span className={styles.runStatus}>
											<span className={styles.muted}>{t('exampleNote')}</span>
										</span>
										<Button
											type="button"
											size="sm"
											className={styles.submitButton}
											disabled={busy != null}
											onClick={() => setConfirming(true)}
										>
											{t('submit')}
										</Button>
									</>
								)}
							</div>
						) : null}
					</section>
				</div>
			</div>
		</div>
	)
}
