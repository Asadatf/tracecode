'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PlayIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { CodeEditor } from '@/components/trace/code-editor'
import { TraceLoader } from '@/components/ui/trace-loader'
import { runCode } from '@/lib/trace/run-code'
import type { RunResult } from '@/lib/trace/contract'
import { exampleRunRequest, type ExamProblem } from '@/lib/challenge/exam-problem'
import { formatClock } from '@/lib/challenge/daily'
import {
	autosaveExamAction,
	examStatusAction,
	reportIntegrityEventsAction,
	startExamAction,
	submitExamAction
} from '@/server/actions/exam'
import type { ExamProblemView, ExamPublicView } from '@/server/exam/exam'
import type { ExamResultView } from '@/server/exam/results'
import practice from '@/components/trace/practice.module.css'
import ws from '@/components/trace/workspace/workspace.module.css'
import styles from '@/components/challenge/challenge.module.css'

// The M10 Daily Exam room (specs/features/daily-exam.md). Everything decisive happens on the server
// (admission, deadline, autosave, the one submission, scoring); this page shows the state, runs the
// public examples in the browser, and reports CLIENT-OBSERVED integrity events. It never records,
// stores or transmits camera, microphone or screen content: the media streams are opened only to
// observe that they are live, and are stopped when the exam ends or the page closes.

const COPY = {
	disclosure:
		'Your exam session is monitored for browser activity and device interruptions. Confirmed rule violations may affect your final score. Camera, microphone and screen content are not recorded or stored.',
	paste: 'Pasting is disabled during the exam.',
	tab: 'You left the exam tab. This event has been recorded.',
	fullscreen:
		'You left fullscreen. This event has been recorded. Return to fullscreen to continue.',
	screen: 'Screen sharing has stopped. Restore it to continue the proctored exam.',
	camera: 'Your camera has stopped. Restore it to continue the proctored exam.',
	microphone: 'Your microphone has stopped. Restore it to continue the proctored exam.',
	shortcut: 'A possible screenshot shortcut was observed and recorded.'
}

type SaveState = 'idle' | 'saving' | 'saved' | 'retrying'
type Media = { camera: boolean; microphone: boolean; screen: boolean; surface: string }
type QueuedEvent = {
	clientEventId: string
	clientSeq: number
	type: string
	occurredAt: string
	screenCount?: number
}

const IMMEDIATE = new Set([
	'tab_hidden',
	'tab_visible',
	'fullscreen_exited',
	'fullscreen_entered',
	'paste_blocked',
	'drag_insert_blocked'
])

function toExamProblem(p: ExamProblemView): ExamProblem {
	return {
		slug: 'exam',
		title: p.title,
		entry: p.entry,
		params: p.params.length > 0 ? p.params : [{ name: 'x' }],
		difficulty: 'medium',
		statement: p.statement,
		examples: p.examples as ExamProblem['examples'],
		starter: p.starter
	}
}

const units = (n: number | null | undefined) => ((n ?? 0) / 100).toFixed(2)

export function ExamRoom({
	date,
	initialView,
	attempt,
	problem
}: {
	date: string
	initialView: ExamPublicView
	attempt: { status: string; autosave: { source: string; clientSeq: number } | null } | null
	problem: ExamProblemView | null
}) {
	const router = useRouter()
	const [view, setView] = useState(initialView)
	const [attemptStatus, setAttemptStatus] = useState(attempt?.status ?? null)
	const [result, setResult] = useState<ExamResultView | null>(null)
	const [offsetMs] = useState(() => Date.parse(initialView.serverNow) - Date.now())
	const [now, setNow] = useState(() => Date.parse(initialView.serverNow))

	// Server status poll: faster while results are being processed.
	useEffect(() => {
		const tick = window.setInterval(() => setNow(Date.now() + offsetMs), 1000)
		return () => window.clearInterval(tick)
	}, [offsetMs])
	const phase = view.phase
	useEffect(() => {
		const every =
			phase === 'closed' || phase === 'processing' ? 5000 : phase === 'published' ? 0 : 15000
		if (every === 0) return
		const id = window.setInterval(async () => {
			const r = await examStatusAction({ date })
			if (!r.ok || !r.data.ok) return
			setView(r.data.view)
			setAttemptStatus(r.data.attempt?.status ?? null)
			if (r.data.result != null) setResult(r.data.result)
			if (r.data.view.phase !== phase) router.refresh()
		}, every)
		return () => window.clearInterval(id)
	}, [phase, date, router])
	useEffect(() => {
		if (phase !== 'published') return
		void examStatusAction({ date }).then((r) => {
			if (r.ok && r.data.ok && r.data.result != null) setResult(r.data.result)
		})
	}, [phase, date])

	const opensAt = Date.parse(view.opensAt)
	const closesAt = Date.parse(view.closesAt)
	const admitted = attemptStatus === 'admitted'
	const inWindow = now >= opensAt && now < closesAt

	return (
		<div className={cn(practice.page, practice.workspacePage)} data-workspace>
			<div className={practice.toolbar}>
				<div className={styles.toolbarTitle}>
					<span className={styles.toolbarEyebrow}>
						Daily Exam{view.isTest ? ' · test schedule' : ''}
						{view.isRepeat === true ? ' · repeat problem' : ''}
					</span>
					<span className={styles.toolbarDate}>{date} · 15:00–15:30 UTC</span>
				</div>
				<span className={practice.toolbarSpacer} />
				<span className={styles.timer} role="timer">
					{now < opensAt ? (
						<>
							<span className={styles.timerLabel}>Opens in</span>
							<strong>{formatClock(opensAt - now)}</strong>
						</>
					) : inWindow ? (
						<>
							<span className={styles.timerLabel}>Closes in</span>
							<strong data-low={closesAt - now < 5 * 60_000 ? 'true' : undefined}>
								{formatClock(closesAt - now)}
							</strong>
						</>
					) : (
						<span className={styles.timerLabel}>Exam closed</span>
					)}
				</span>
			</div>
			{admitted && inWindow && problem != null ? (
				<Workspace
					date={date}
					problem={problem}
					closesAt={closesAt}
					now={now}
					initialCode={attempt?.autosave?.source ?? problem.starter}
					initialSeq={attempt?.autosave?.clientSeq ?? 0}
					onSubmitted={() => {
						setAttemptStatus('submitted')
						router.refresh()
					}}
				/>
			) : (
				<div className={ws.workspace}>
					<div
						className={cn(ws.pane, styles.dark)}
						style={{ margin: '0 auto', maxWidth: 820, width: '100%' }}
					>
						<div className={ws.paneBody} style={{ padding: 24 }}>
							<Lobby
								view={view}
								now={now}
								attemptStatus={attemptStatus}
								result={result}
								date={date}
								onStarted={() => {
									setAttemptStatus('admitted')
									router.refresh()
								}}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

// ---- Lobby: before opening, admission, closed/processing, results ------------------------------

function Lobby({
	view,
	now,
	attemptStatus,
	result,
	date,
	onStarted
}: {
	view: ExamPublicView
	now: number
	attemptStatus: string | null
	result: ExamResultView | null
	date: string
	onStarted: () => void
}) {
	const opensAt = Date.parse(view.opensAt)
	const closesAt = Date.parse(view.closesAt)
	const lateUntil = Date.parse(view.lateEntryUntil)
	if (view.phase === 'cancelled')
		return <p role="status">Today&apos;s exam cannot run. Practise any problem in the meantime.</p>
	if (view.phase === 'published' && result != null) return <Result result={result} date={date} />
	if (view.phase === 'published' && attemptStatus == null)
		return (
			<p>
				This exam has finished. <a href={`/exam/${date}/leaderboard`}>See the leaderboard.</a>
			</p>
		)
	if (attemptStatus != null && attemptStatus !== 'admitted')
		return (
			<div role="status" aria-live="polite">
				<h3>Submission recorded</h3>
				<TraceLoader tone="dark" width={72} className="mb-2" />
				<p>
					Results are being graded and finalised. They appear here automatically
					{now > Date.parse(view.resultsDueAt)
						? ' (still processing, past the 16:30 UTC target)'
						: ' by 16:30 UTC'}
					.
				</p>
			</div>
		)
	if (now >= closesAt)
		return <p>The exam has closed. Results appear here and on the leaderboard once finalised.</p>
	return (
		<div>
			<h3>How the Daily Exam works</h3>
			<ul className={styles.rules}>
				<li>One problem for everyone, 30 minutes, 15:00–15:30 UTC. There is no overtime.</li>
				<li>Entry closes 10 minutes after opening; entering late does not extend the deadline.</li>
				<li>Run tries the public examples as often as you like. You get ONE final Submit.</li>
				<li>Your code autosaves; at 15:30 your last autosave is submitted for you.</li>
				<li>
					Score: up to 80 for hidden tests passed, up to 20 for speed on a full pass, minus
					documented integrity deductions (at most 20).
				</li>
				<li>
					Pasting and drag-and-drop into the editor are disabled. Tab, focus and fullscreen changes
					are recorded.
				</li>
			</ul>
			<p className={styles.muted} style={{ marginTop: 12 }}>
				{COPY.disclosure} Nobody can watch your camera, microphone or screen. A browser cannot see
				other devices, other people or screenshots taken outside the page; these signals are
				observations, not proof. If you decline, you can keep practising instead.
			</p>
			{now < opensAt ? (
				<p style={{ marginTop: 16 }}>
					Opens at {new Date(opensAt).toUTCString().slice(17, 22)} UTC (
					{new Date(opensAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} your
					time). You can run the checks now.
				</p>
			) : now >= lateUntil && attemptStatus == null ? (
				<p role="alert" style={{ marginTop: 16 }}>
					Entry closed 10 minutes after opening.
				</p>
			) : null}
			{attemptStatus == null && now < lateUntil ? (
				<Preflight date={date} canStart={now >= opensAt} onStarted={onStarted} />
			) : null}
		</div>
	)
}

// Opens the camera, microphone and entire-screen share (used ONLY to observe that they are live;
// no frame or sample is read). A plain function, outside any component.
async function acquireMedia(): Promise<{ ok: true; media: Media } | { ok: false; error: string }> {
	try {
		const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
		window.__examMedia = { ...(window.__examMedia ?? {}), cam }
		const display = await navigator.mediaDevices.getDisplayMedia({
			video: { displaySurface: 'monitor' } as MediaTrackConstraints,
			audio: false
		})
		window.__examMedia = { ...(window.__examMedia ?? {}), display }
		const track = display.getVideoTracks()[0]
		const settings = track == null ? {} : (track.getSettings() as { displaySurface?: string })
		return {
			ok: true,
			media: {
				camera: cam.getVideoTracks().some((t) => t.readyState === 'live'),
				microphone: cam.getAudioTracks().some((t) => t.readyState === 'live'),
				screen: display.getVideoTracks().some((t) => t.readyState === 'live'),
				surface: settings.displaySurface ?? 'unknown'
			}
		}
	} catch (e) {
		const name = e instanceof DOMException ? e.name : 'Error'
		return {
			ok: false,
			error:
				name === 'NotAllowedError'
					? 'Permission was denied. The proctored exam needs camera, microphone and entire-screen sharing; you can practise instead.'
					: name === 'NotFoundError'
						? 'No camera or microphone was found on this device.'
						: 'These checks need a supported desktop browser (Chromium-based or Firefox).'
		}
	}
}

function Preflight({
	date,
	canStart,
	onStarted
}: {
	date: string
	canStart: boolean
	onStarted: () => void
}) {
	const [media, setMedia] = useState<Media>({
		camera: false,
		microphone: false,
		screen: false,
		surface: 'unknown'
	})
	const [fullscreen, setFullscreen] = useState(false)
	const [screens, setScreens] = useState<{
		status: 'reported' | 'unsupported' | 'denied'
		count: number | null
	}>({
		status: 'unsupported',
		count: null
	})
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		const onFs = () => setFullscreen(document.fullscreenElement != null)
		document.addEventListener('fullscreenchange', onFs)
		return () => document.removeEventListener('fullscreenchange', onFs)
	}, [])

	async function runChecks() {
		setError(null)
		const acquired = await acquireMedia()
		if (acquired.ok) setMedia(acquired.media)
		else setError(acquired.error)
		const w = window as Window & { getScreenDetails?: () => Promise<{ screens: unknown[] }> }
		if (typeof w.getScreenDetails === 'function') {
			const details = await w.getScreenDetails().catch(() => null)
			setScreens(
				details == null
					? { status: 'denied', count: null }
					: { status: 'reported', count: details.screens.length }
			)
		}
	}

	async function start() {
		setBusy(true)
		const r = await startExamAction({
			date,
			preflight: {
				camera: media.camera,
				microphone: media.microphone,
				screen: media.screen,
				screenSurface:
					media.surface === 'monitor'
						? 'monitor'
						: media.surface === 'window'
							? 'window'
							: media.surface === 'browser'
								? 'browser'
								: 'unknown',
				fullscreen,
				screenDetails: screens.status,
				screenCount: screens.count
			}
		})
		setBusy(false)
		if (r.ok && r.data.ok) onStarted()
		else
			setError(
				r.ok && !r.data.ok
					? {
							preflight:
								'Complete every check first: camera, microphone, entire-screen sharing and fullscreen.',
							late: 'Entry closed 10 minutes after opening.',
							not_open: 'The exam has not opened yet.',
							closed: 'The exam has closed.',
							not_found: 'There is no exam on this date.',
							unavailable: 'The exam is unavailable right now.',
							unauthenticated: 'Sign in to take the exam.'
						}[r.data.error]
					: 'The exam is unavailable right now.'
			)
	}

	const row = (label: string, ok: boolean, detail?: string) => (
		<li>
			{ok ? '✓' : '○'} {label}
			{detail ? <span className={styles.muted}> — {detail}</span> : null}
		</li>
	)
	const allOk =
		media.camera && media.microphone && media.screen && media.surface === 'monitor' && fullscreen
	return (
		<div style={{ marginTop: 16 }}>
			<h3>Proctoring checks</h3>
			<ul className={styles.rules}>
				{row('Camera connected', media.camera)}
				{row('Microphone connected', media.microphone)}
				{row(
					'Entire screen shared',
					media.screen && media.surface === 'monitor',
					media.screen
						? `browser reports: ${media.surface === 'monitor' ? 'entire screen' : media.surface === 'browser' ? 'a browser tab' : media.surface === 'window' ? 'a window' : 'not reported'}`
						: undefined
				)}
				{row('Fullscreen', fullscreen)}
				{row(
					'Screens',
					screens.status === 'reported',
					screens.status === 'reported'
						? `${screens.count} reported`
						: screens.status === 'denied'
							? 'permission denied (recorded as unverified)'
							: 'not supported by this browser (recorded as unverified)'
				)}
			</ul>
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
				<Button type="button" size="sm" variant="ghost" onClick={runChecks}>
					Start checks
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
				>
					Enter fullscreen
				</Button>
				<Button type="button" size="sm" disabled={!canStart || !allOk || busy} onClick={start}>
					{canStart ? (busy ? 'Starting…' : 'Start the exam') : 'Opens at 15:00 UTC'}
				</Button>
			</div>
			{error ? (
				<p role="alert" className={styles.error} style={{ marginTop: 8 }}>
					{error}
				</p>
			) : null}
		</div>
	)
}

declare global {
	interface Window {
		__examMedia?: { cam?: MediaStream; display?: MediaStream }
	}
}

function stopMedia() {
	for (const s of [window.__examMedia?.cam, window.__examMedia?.display])
		s?.getTracks().forEach((t) => t.stop())
	window.__examMedia = {}
}

// ---- Workspace ---------------------------------------------------------------------------------

function Workspace({
	date,
	problem,
	closesAt,
	now,
	initialCode,
	initialSeq,
	onSubmitted
}: {
	date: string
	problem: ExamProblemView
	closesAt: number
	now: number
	initialCode: string
	initialSeq: number
	onSubmitted: () => void
}) {
	const [code, setCode] = useState(initialCode)
	const [save, setSave] = useState<SaveState>('idle')
	const [warning, setWarning] = useState<string | null>(null)
	const [runResult, setRunResult] = useState<RunResult | null>(null)
	const [busy, setBusy] = useState<null | 'running' | 'submitting'>(null)
	const [confirming, setConfirming] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const editorRef = useRef<HTMLDivElement>(null)
	const seqRef = useRef(initialSeq)
	const eventSeqRef = useRef(0)
	const queueRef = useRef<QueuedEvent[]>([])
	const dirtyRef = useRef(false)
	const codeRef = useRef(initialCode)

	const flush = useCallback(async () => {
		const batch = queueRef.current.splice(0, 50)
		if (batch.length === 0) return
		const sent = await reportIntegrityEventsAction({ date, events: batch }).then(
			() => true,
			() => false
		)
		if (!sent) queueRef.current.unshift(...batch)
	}, [date])

	const record = useCallback(
		(type: string, extra?: { screenCount?: number }) => {
			eventSeqRef.current += 1
			queueRef.current.push({
				clientEventId: `${Date.now().toString(36)}-${eventSeqRef.current}-${Math.random().toString(36).slice(2, 8)}`,
				clientSeq: eventSeqRef.current,
				type,
				occurredAt: new Date().toISOString(),
				...extra
			})
			if (IMMEDIATE.has(type)) void flush()
		},
		[flush]
	)

	const saveNow = useCallback(async () => {
		if (!dirtyRef.current) return
		dirtyRef.current = false
		seqRef.current += 1
		setSave('saving')
		const r = await autosaveExamAction({
			date,
			source: codeRef.current,
			clientSeq: seqRef.current
		}).catch(() => null)
		const saved = r != null && r.ok && (r.data.ok || r.data.error === 'stale')
		setSave(saved ? 'saved' : 'retrying')
		if (!(r != null && r.ok && r.data.ok)) dirtyRef.current = true
	}, [date])

	// Integrity monitoring (exam only). Every listener is removed when the workspace unmounts.
	useEffect(() => {
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				record('tab_hidden')
				void saveNow()
			} else {
				record('tab_visible')
				setWarning(COPY.tab)
			}
		}
		const onBlur = () => record('window_blurred')
		const onFocus = () => record('window_focused')
		const onFs = () => {
			if (document.fullscreenElement == null) {
				record('fullscreen_exited')
				setWarning(COPY.fullscreen)
			} else record('fullscreen_entered')
		}
		const onOffline = () => record('network_offline')
		const onOnline = () => {
			record('network_online')
			void flush()
		}
		const onKey = (e: KeyboardEvent) => {
			const mac = e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)
			const win = e.metaKey && e.shiftKey && e.key.toLowerCase() === 's'
			if (e.key === 'PrintScreen' || mac || win) {
				record('screenshot_shortcut_observed')
				setWarning(COPY.shortcut)
			}
		}
		document.addEventListener('visibilitychange', onVisibility)
		window.addEventListener('blur', onBlur)
		window.addEventListener('focus', onFocus)
		document.addEventListener('fullscreenchange', onFs)
		window.addEventListener('offline', onOffline)
		window.addEventListener('online', onOnline)
		window.addEventListener('keyup', onKey)
		window.addEventListener('keydown', onKey)
		const trackWatch: (() => void)[] = []
		const watch = (
			stream: MediaStream | undefined,
			kind: 'video' | 'audio',
			type: string,
			message: string
		) => {
			for (const t of kind === 'video'
				? (stream?.getVideoTracks() ?? [])
				: (stream?.getAudioTracks() ?? [])) {
				const ended = () => {
					record(`${type}_interrupted`)
					setWarning(message)
				}
				t.addEventListener('ended', ended)
				t.addEventListener('mute', ended)
				trackWatch.push(() => {
					t.removeEventListener('ended', ended)
					t.removeEventListener('mute', ended)
				})
			}
		}
		watch(window.__examMedia?.cam, 'video', 'camera', COPY.camera)
		watch(window.__examMedia?.cam, 'audio', 'microphone', COPY.microphone)
		watch(window.__examMedia?.display, 'video', 'screen_capture', COPY.screen)
		const w = window as Window & { getScreenDetails?: () => Promise<{ screens: unknown[] }> }
		if (typeof w.getScreenDetails === 'function')
			w.getScreenDetails().then(
				(d) => record('screens_reported', { screenCount: d.screens.length }),
				() => record('screens_denied')
			)
		else record('screens_unsupported')
		const flusher = window.setInterval(() => void flush(), 15_000)
		const saver = window.setInterval(() => void saveNow(), 15_000)
		return () => {
			document.removeEventListener('visibilitychange', onVisibility)
			window.removeEventListener('blur', onBlur)
			window.removeEventListener('focus', onFocus)
			document.removeEventListener('fullscreenchange', onFs)
			window.removeEventListener('offline', onOffline)
			window.removeEventListener('online', onOnline)
			window.removeEventListener('keyup', onKey)
			window.removeEventListener('keydown', onKey)
			trackWatch.forEach((off) => off())
			window.clearInterval(flusher)
			window.clearInterval(saver)
			void flush()
		}
	}, [record, flush, saveNow])

	// Paste and drag-insertion blocking on the editor, at the input-model level (exam mode only).
	useEffect(() => {
		const el = editorRef.current
		if (el == null) return
		const block = (type: 'paste_blocked' | 'drag_insert_blocked') => (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
			record(type)
			setWarning(COPY.paste)
		}
		const onPaste = block('paste_blocked')
		const onDrop = block('drag_insert_blocked')
		const onBeforeInput = (e: Event) => {
			const t = (e as InputEvent).inputType
			if (t === 'insertFromPaste' || t === 'insertFromPasteAsQuotation') onPaste(e)
			else if (t === 'insertFromDrop') onDrop(e)
		}
		const onDragOver = (e: Event) => e.preventDefault()
		const noCopy = (e: Event) => e.preventDefault()
		el.addEventListener('paste', onPaste, true)
		el.addEventListener('drop', onDrop, true)
		el.addEventListener('dragover', onDragOver, true)
		el.addEventListener('beforeinput', onBeforeInput, true)
		el.addEventListener('copy', noCopy, true)
		el.addEventListener('cut', noCopy, true)
		return () => {
			el.removeEventListener('paste', onPaste, true)
			el.removeEventListener('drop', onDrop, true)
			el.removeEventListener('dragover', onDragOver, true)
			el.removeEventListener('beforeinput', onBeforeInput, true)
			el.removeEventListener('copy', noCopy, true)
			el.removeEventListener('cut', noCopy, true)
		}
	}, [record])

	// At the deadline the server refuses everything; locally we stop media and flush.
	const closed = now >= closesAt
	useEffect(() => {
		if (!closed) return
		stopMedia()
		void flush()
	}, [closed, flush])
	useEffect(() => () => stopMedia(), [])

	const examProblem = toExamProblem(problem)
	async function run() {
		setBusy('running')
		setRunResult(null)
		const res = await runCode(exampleRunRequest(examProblem, code)).catch(() => null)
		if (res == null) setError('Run failed. Try again.')
		else setRunResult(res)
		setBusy(null)
	}
	async function submit() {
		setBusy('submitting')
		setConfirming(false)
		await saveNow()
		const r = await submitExamAction({ date, source: code })
		setBusy(null)
		if (r.ok && r.data.ok) {
			stopMedia()
			await flush()
			onSubmitted()
		} else
			setError(
				r.ok && !r.data.ok
					? {
							closed: 'The exam has closed.',
							too_large: 'Your code is too large.',
							empty: 'Write some code first.',
							already_submitted: 'You have already submitted.'
						}[r.data.error]
					: 'Submission failed. Try again.'
			)
	}

	const passed = runResult?.tests.filter((t) => t.passed).length ?? 0
	return (
		<div className={ws.workspace}>
			<div className={styles.panes} style={{ '--left': '38%' } as React.CSSProperties}>
				<section aria-labelledby="exam-title" className={ws.pane}>
					<div className={ws.paneHead}>
						<span className={styles.headTitle}>Problem</span>
						<span className={styles.badge} title="Monitoring is active">
							● Monitoring active
						</span>
					</div>
					<div className={cn(ws.paneBody, styles.problemBody)}>
						<h2 id="exam-title">{problem.title}</h2>
						{problem.statement.map((p) => (
							<p key={p}>{p}</p>
						))}
						<h3>Examples</h3>
						{problem.examples.map((ex, i) => (
							<div key={i} className={styles.example}>
								{problem.entry}({ex.args.map((a) => JSON.stringify(a)).join(', ')}) →{' '}
								{JSON.stringify(ex.output)}
							</div>
						))}
					</div>
				</section>
				<span />
				<section aria-label="Exam code" className={cn(ws.pane, ws.paneCode)}>
					<div className={ws.paneHead}>
						<div className={ws.fileChip} style={{ paddingLeft: 10 }}>
							<span className={practice.py}>Py</span> {problem.entry}.py
						</div>
						<span className={styles.runStatus} role="status" aria-live="polite">
							<b>
								{busy === 'running'
									? 'Running…'
									: runResult == null
										? ''
										: runResult.status !== 'completed'
											? 'Your code did not run. Check for errors.'
											: `Public examples passed: ${passed} of ${runResult.tests.length}`}
							</b>
						</span>
						<button
							type="button"
							className={cn(ws.codeIcon, ws.codeRun)}
							aria-label="Run examples"
							title="Run examples"
							disabled={busy != null || closed}
							onClick={run}
						>
							<PlayIcon size={16} />
						</button>
					</div>
					<div className={ws.paneBody}>
						{warning ? (
							<p role="alert" className={styles.error} style={{ margin: 8 }}>
								{warning}{' '}
								<button type="button" className={styles.muted} onClick={() => setWarning(null)}>
									Dismiss
								</button>
								{warning === COPY.fullscreen ? (
									<button
										type="button"
										onClick={() =>
											void document.documentElement.requestFullscreen().catch(() => undefined)
										}
									>
										{' '}
										Return to fullscreen
									</button>
								) : null}
							</p>
						) : null}
						<div ref={editorRef} className={styles.editorFill}>
							<CodeEditor
								value={code}
								readOnly={closed || busy === 'submitting'}
								onChange={(next) => {
									setCode(next)
									codeRef.current = next
									dirtyRef.current = true
									setSave('idle')
								}}
								ariaLabel="Exam code editor (pasting disabled)"
							/>
						</div>
					</div>
					<div className={styles.foot}>
						<span className={styles.runStatus}>
							<span className={styles.muted}>
								{save === 'saving'
									? 'Saving…'
									: save === 'saved'
										? 'Saved'
										: save === 'retrying'
											? 'Not saved — retrying'
											: 'Autosaves every 15 s'}
							</span>
						</span>
						{error ? <span className={styles.error}>{error}</span> : null}
						{confirming ? (
							<>
								<span className={styles.confirm}>
									This is your one final submission. It cannot be changed.
								</span>
								<Button type="button" size="sm" disabled={busy != null} onClick={submit}>
									Yes, submit
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => setConfirming(false)}
								>
									Cancel
								</Button>
							</>
						) : (
							<Button
								type="button"
								size="sm"
								className={styles.submitButton}
								disabled={busy != null || closed}
								onClick={() => setConfirming(true)}
							>
								Submit final answer
							</Button>
						)}
					</div>
				</section>
			</div>
		</div>
	)
}

// ---- Result ------------------------------------------------------------------------------------

const RULES: Record<string, string> = {
	tab_hidden: 'Leaving the exam tab more than once, beyond a 30-second grace',
	blocked_insertion: 'More than two blocked paste or drag attempts',
	fullscreen_exit: 'Leaving fullscreen more than once, or for more than 15 seconds'
}
const FLAGS: Record<string, string> = {
	window_blur: 'window focus changes',
	screenshot_shortcut: 'possible screenshot shortcuts',
	multiple_screens: 'more than one screen reported',
	screen_check_unavailable: 'screen check unavailable',
	camera_interruption: 'camera interruptions',
	microphone_interruption: 'microphone interruptions',
	screen_capture_interruption: 'screen-share interruptions',
	network_interruption: 'network interruptions',
	reporting_gap: 'gaps in event reporting'
}

function Result({ result, date }: { result: ExamResultView; date: string }) {
	const a = result.assessment
	const tagged = (items: { tag: string; text: string }[]) => (
		<ul className={styles.rules}>
			{items.map((s, i) => (
				<li key={i}>
					<span className={styles.badge}>{s.tag}</span> {s.text}
				</li>
			))}
		</ul>
	)
	return (
		<div role="status" aria-live="polite">
			<h3 className={styles.doneHeading}>
				Final score {units(result.finalScore)} / 100
				{result.ranked && result.rank != null
					? ` · rank ${result.rank} of ${result.participants}`
					: ''}
			</h3>
			{result.isRepeat ? (
				<p className={styles.muted}>
					This problem has appeared in a previous exam and is available in Practice.
				</p>
			) : null}
			<ul className={styles.rules}>
				<li>
					Hidden tests: {result.testsPassed ?? 0} of {result.testsTotal ?? 0} passed
					{result.status === 'no_submission' ? ' (no submission)' : ''}
					{result.status === 'grading_failed' ? ' (grading failed; not ranked)' : ''}
				</li>
				<li>
					Correctness {units(result.correctnessScore)} + speed {units(result.speedScore)} = coding{' '}
					{units(result.codingScore)}
				</li>
				<li>
					Submitted {result.submissionKind === 'auto' ? 'automatically at the deadline' : 'by you'}
					{result.elapsedSeconds != null
						? ` after ${formatClock(result.elapsedSeconds * 1000)}`
						: ''}
				</li>
				<li>Integrity deductions: −{units(result.deductions)}</li>
				{(result.integrity?.deductions ?? []).map((d) => (
					<li key={d.rule} className={styles.muted}>
						−{units(d.points)}: {RULES[d.rule] ?? d.rule} ({d.units}×)
					</li>
				))}
				{result.flags.length > 0 ? (
					<li className={styles.muted}>
						Recorded for review, with no penalty:{' '}
						{result.flags.map((f) => `${f.count} ${FLAGS[f.kind] ?? f.kind}`).join(', ')}. These are
						browser observations, not proof.
					</li>
				) : null}
			</ul>
			<div className={styles.assessment}>
				<strong>AI feedback</strong> <span className={styles.badge}>AI estimate</span>
				{a == null ? (
					<p className={styles.muted}>
						{result.assessmentStatus === 'unavailable'
							? 'AI feedback is unavailable right now.'
							: 'AI feedback is being prepared…'}
					</p>
				) : (
					<>
						{tagged(a.overall)}
						{a.correctnessGaps.length > 0 ? tagged(a.correctnessGaps) : null}
						<p>
							Time {a.efficiency.timeComplexity} · Space {a.efficiency.spaceComplexity} · Looks:{' '}
							{a.efficiency.level.replace('_', ' ')}
						</p>
						{tagged(a.efficiency.notes)}
						{tagged(a.timeManagement)}
						{tagged(a.integrityObservations.map((o) => ({ tag: o.tag, text: o.text })))}
						{tagged(a.deductionExplanation)}
						{tagged(a.recommendations)}
						<p>{a.summary}</p>
						<p className={styles.muted}>
							Generated by an AI from your code and the recorded evidence. Estimates are not proof;
							the AI cannot change your score, rank or deductions.
						</p>
					</>
				)}
			</div>
			<p style={{ marginTop: 12 }}>
				<a href={`/exam/${date}/leaderboard`}>See the leaderboard</a>
			</p>
		</div>
	)
}
