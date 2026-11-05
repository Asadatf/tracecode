'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import { Button } from '@/components/ui/button'
import { CodeEditor } from '@/components/trace/code-editor'
import { runCode } from '@/lib/trace/run-code'
import type { RunResult } from '@/lib/trace/contract'
import { exampleRunRequest, type ExamProblem } from '@/lib/challenge/exam-problem'
import { EXAM_DURATION_MS } from '@/lib/challenge/exam-rules'
import type { AttemptView } from '@/lib/challenge/service'
import {
	challengeStatusAction,
	startChallengeAction,
	submitChallengeAction
} from '@/server/actions/challenge'
import styles from './challenge.module.css'

// The timed assessment (specs/features/daily-challenge.md). The statement, a code editor,
// a countdown, Start, Run and Submit — and nothing that teaches: no Tracy, hints, replay,
// solutions or topic labels are rendered here at all.
//
// The server owns the clock. The countdown below is only a DISPLAY, derived from the
// server's deadline and a one-time offset to the server's "now"; changing the browser's
// clock changes what this page shows, never when the exam ends: the server judges every
// submission against its own recorded deadline. Run executes the PUBLIC examples in the
// browser as feedback and is never sent to the server or scored.

type Busy = null | 'starting' | 'submitting' | 'running'
type ErrorKey =
	null | 'generic' | 'unauthenticated' | 'notLive' | 'notStarted' | 'empty' | 'tooLarge'

const POLL_MS = 4000

function format(ms: number): string {
	const total = Math.ceil(ms / 1000)
	return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

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
	problem,
	initial,
	serverNow,
	scoringActive
}: {
	date: string
	problem: ExamProblem
	initial: AttemptView | null
	serverNow: string
	// Whether competitive grading is switched on. When it is not, a submission is saved
	// and waits; the page says so and does not poll for a score that cannot arrive.
	scoringActive: boolean
}) {
	const t = useTranslations('Challenge')
	const [view, setView] = useState<AttemptView | null>(initial)
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
	const submittedRef = useRef(false)

	const phase = view?.phase ?? null
	const deadline = view == null ? 0 : Date.parse(view.deadlineAt)
	const remaining = Math.max(0, deadline - now)
	const code = edited ?? (phase === 'running' ? draft : null) ?? problem.starter

	function changeCode(next: string) {
		setEdited(next)
		try {
			window.localStorage.setItem(draftKey(date), next)
		} catch {
			// Ignore a blocked or full store.
		}
	}

	// The countdown tick (display only).
	useEffect(() => {
		if (phase !== 'running') return
		const id = window.setInterval(() => setNow(Date.now() + offsetMs), 1000)
		return () => window.clearInterval(id)
	}, [phase, offsetMs])

	const apply = useCallback((result: Awaited<ReturnType<typeof submitChallengeAction>>) => {
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
	}, [])

	async function start() {
		setBusy('starting')
		apply(await startChallengeAction({ date }))
		setBusy(null)
	}

	const submit = useCallback(async () => {
		if (submittedRef.current) return
		submittedRef.current = true
		setBusy('submitting')
		setConfirming(false)
		const ok = apply(await submitChallengeAction({ date, source: code }))
		// A failed request may be retried; an accepted one never is.
		if (!ok) submittedRef.current = false
		setBusy(null)
	}, [apply, code, date])

	// At zero the page submits what is in the editor once; the server decides whether it
	// arrived in time.
	useEffect(() => {
		if (phase === 'running' && remaining === 0 && deadline > 0) void submit()
		// `submit` is guarded by submittedRef, so a re-run of this effect cannot send twice.
	}, [phase, remaining, deadline, submit])

	// While a submission waits for grading, poll the server. Not when grading is off.
	useEffect(() => {
		if (!scoringActive) return
		if (phase !== 'submitted' && phase !== 'grading' && phase !== 'grader_error') return
		const id = window.setInterval(async () => {
			const result = await challengeStatusAction({ date })
			if (result.ok && result.data.ok) setView(result.data.view)
		}, POLL_MS)
		return () => window.clearInterval(id)
	}, [phase, date, scoringActive])

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

	const examples = problem.examples
	const passedExamples = runResult?.tests.filter((r) => r.passed).length ?? 0

	return (
		<div className={styles.exam}>
			<section aria-labelledby="exam-title" className={styles.statement}>
				<h2 id="exam-title" className={styles.problemTitle}>
					{problem.title}
				</h2>
				{problem.statement.map((paragraph) => (
					<p key={paragraph}>{paragraph}</p>
				))}
				<h3 className={styles.sub}>{t('examples')}</h3>
				<ul className={styles.examples}>
					{examples.map((example, index) => (
						<li key={index}>
							<code>
								{problem.entry}({example.args.map((arg) => JSON.stringify(arg)).join(', ')})
							</code>{' '}
							→ <code>{JSON.stringify(example.output)}</code>
						</li>
					))}
				</ul>
			</section>

			<section aria-label={t('workArea')} className={styles.work}>
				{phase == null ? (
					<div className={styles.card}>
						<h3 className={styles.sub}>{t('rules.heading')}</h3>
						<ul className={styles.rules}>
							<li>{t('rules.time', { minutes: EXAM_DURATION_MS / 60000 })}</li>
							<li>{t('rules.once')}</li>
							<li>{t('rules.run')}</li>
							<li>{t('rules.noHelp')}</li>
							<li>{t('rules.hidden')}</li>
							{scoringActive ? null : <li>{t('rules.gradingOff')}</li>}
						</ul>
						<Button type="button" disabled={busy != null} onClick={start}>
							{busy === 'starting' ? t('starting') : t('start')}
						</Button>
					</div>
				) : null}

				{phase === 'running' ? (
					<>
						<div className={styles.bar}>
							<span className={styles.timer} role="timer" aria-label={t('timeLeftLabel')}>
								<span className={styles.timerLabel}>{t('timeLeft')}</span>
								<strong data-low={remaining < 5 * 60_000 ? 'true' : undefined}>
									{format(remaining)}
								</strong>
							</span>
							<div className={styles.actions}>
								<Button type="button" variant="outline" disabled={busy != null} onClick={run}>
									{busy === 'running' ? t('running') : t('run')}
								</Button>
								{confirming ? (
									<>
										<Button type="button" disabled={busy != null} onClick={submit}>
											{busy === 'submitting' ? t('submitting') : t('confirmSubmit')}
										</Button>
										<Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
											{t('cancel')}
										</Button>
									</>
								) : (
									<Button type="button" disabled={busy != null} onClick={() => setConfirming(true)}>
										{t('submit')}
									</Button>
								)}
							</div>
						</div>
						{confirming ? (
							<p role="alert" className={styles.confirm}>
								{t('confirmText')}
							</p>
						) : null}
						<div className={styles.editor}>
							<CodeEditor value={code} onChange={changeCode} ariaLabel={t('editor')} />
						</div>
						{runResult != null ? (
							<div className={styles.results} role="status" aria-live="polite">
								<strong>
									{t('exampleResult', { passed: passedExamples, total: runResult.tests.length })}
								</strong>
								{runResult.status !== 'completed' ? <p>{t('runProblem')}</p> : null}
								<p className={styles.muted}>{t('exampleNote')}</p>
							</div>
						) : null}
					</>
				) : null}

				{phase === 'submitted' || phase === 'grading' ? (
					<div className={styles.card} role="status" aria-live="polite">
						<h3 className={styles.sub}>{t('submittedHeading')}</h3>
						<p>
							{scoringActive
								? phase === 'grading'
									? t('grading')
									: t('awaitingGrading')
								: t('savedNotScored')}
						</p>
					</div>
				) : null}

				{phase === 'graded' && view != null ? (
					<div className={styles.card} role="status" aria-live="polite">
						<h3 className={styles.sub}>{t('gradedHeading')}</h3>
						<p>{t('graded', { passed: view.testsPassed ?? 0, total: view.testsTotal ?? 0 })}</p>
						<p className={styles.score}>{t('score', { score: view.score ?? 0 })}</p>
						<p className={styles.muted}>{t('timeTaken', { time: format(view.elapsedMs ?? 0) })}</p>
					</div>
				) : null}

				{phase === 'grader_error' ? (
					<div className={styles.card} role="status" aria-live="polite">
						<h3 className={styles.sub}>{t('graderErrorHeading')}</h3>
						<p>{t('graderError')}</p>
					</div>
				) : null}

				{phase === 'expired' ? (
					<div className={styles.card} role="status" aria-live="polite">
						<h3 className={styles.sub}>{t('expiredHeading')}</h3>
						<p>{t('expired')}</p>
					</div>
				) : null}

				{error != null ? (
					<p role="alert" className={styles.error}>
						{t(`errors.${error}`)}
					</p>
				) : null}

				<p className={styles.back}>
					<Link href="/problems">{t('back')}</Link>
				</p>
			</section>
		</div>
	)
}
