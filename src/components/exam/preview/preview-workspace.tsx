'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from '@/i18n/routing'
import { Button } from '@/components/ui/button'
import { PlayIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { CodeEditor } from '@/components/trace/code-editor'
import { runCode } from '@/lib/trace/run-code'
import type { RunResult } from '@/lib/trace/contract'
import { exampleRunRequest, type ExamProblem } from '@/lib/challenge/exam-problem'
import { formatClock } from '@/lib/challenge/daily'
import practice from '@/components/trace/practice.module.css'
import ws from '@/components/trace/workspace/workspace.module.css'
import challenge from '@/components/challenge/challenge.module.css'
import styles from './preview.module.css'

// Screen 3 — the exam workspace, built from the Practice workspace's own styles and editor.
// PREVIEW: a local 30:00 timer, a public catalogue problem, nothing saved or sent. What IS real:
// the editor's paste/drag blocking, Run (the same in-browser runner as Practice), and the tab,
// focus, fullscreen and screenshot-shortcut observations, which are shown here only.
const TOTAL_MS = 30 * 60_000

interface Counts {
	hidden: number
	hiddenSeconds: number
	blur: number
	fullscreen: number
	blocked: number
	shortcut: number
}

export function PreviewWorkspace({ problem }: { problem: ExamProblem }) {
	const router = useRouter()
	const [code, setCode] = useState(problem.starter)
	const [startedAt] = useState(() => Date.now())
	const [now, setNow] = useState(() => Date.now())
	const [warning, setWarning] = useState<string | null>(null)
	const [counts, setCounts] = useState<Counts>({
		hidden: 0,
		hiddenSeconds: 0,
		blur: 0,
		fullscreen: 0,
		blocked: 0,
		shortcut: 0
	})
	const [runResult, setRunResult] = useState<RunResult | null>(null)
	const [busy, setBusy] = useState<null | 'running'>(null)
	const [confirming, setConfirming] = useState(false)
	const [message, setMessage] = useState<string | null>(null)
	const editorRef = useRef<HTMLDivElement>(null)
	const hiddenAt = useRef<number | null>(null)

	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 1000)
		return () => window.clearInterval(id)
	}, [])
	const remaining = Math.max(0, TOTAL_MS - (now - startedAt))
	const closed = remaining === 0

	const bump = useCallback((patch: Partial<Counts>, text?: string) => {
		setCounts((c) => ({
			hidden: c.hidden + (patch.hidden ?? 0),
			hiddenSeconds: c.hiddenSeconds + (patch.hiddenSeconds ?? 0),
			blur: c.blur + (patch.blur ?? 0),
			fullscreen: c.fullscreen + (patch.fullscreen ?? 0),
			blocked: c.blocked + (patch.blocked ?? 0),
			shortcut: c.shortcut + (patch.shortcut ?? 0)
		}))
		if (text != null) setWarning(text)
	}, [])

	useEffect(() => {
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				hiddenAt.current = Date.now()
				return
			}
			const away = hiddenAt.current == null ? 0 : Math.round((Date.now() - hiddenAt.current) / 1000)
			hiddenAt.current = null
			bump(
				{ hidden: 1, hiddenSeconds: away },
				'You left the exam tab. This event has been recorded.'
			)
		}
		const onBlur = () => bump({ blur: 1 })
		const onFs = () => {
			if (document.fullscreenElement == null)
				bump({ fullscreen: 1 }, 'You left fullscreen. This event has been recorded.')
		}
		const onKey = (e: KeyboardEvent) => {
			const capture =
				e.key === 'PrintScreen' ||
				(e.metaKey && e.shiftKey && ['3', '4', '5', 's', 'S'].includes(e.key))
			if (capture)
				bump({ shortcut: 1 }, 'A possible screenshot shortcut was observed and recorded.')
		}
		document.addEventListener('visibilitychange', onVisibility)
		window.addEventListener('blur', onBlur)
		document.addEventListener('fullscreenchange', onFs)
		window.addEventListener('keyup', onKey)
		return () => {
			document.removeEventListener('visibilitychange', onVisibility)
			window.removeEventListener('blur', onBlur)
			document.removeEventListener('fullscreenchange', onFs)
			window.removeEventListener('keyup', onKey)
		}
	}, [bump])

	// Paste and drag-insertion blocking at the input-model level (exam mode only).
	useEffect(() => {
		const el = editorRef.current
		if (el == null) return
		const block = (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
			bump({ blocked: 1 }, 'Pasting is disabled during the exam.')
		}
		const onBeforeInput = (e: Event) => {
			const t = (e as InputEvent).inputType
			if (t === 'insertFromPaste' || t === 'insertFromPasteAsQuotation' || t === 'insertFromDrop')
				block(e)
		}
		const stop = (e: Event) => e.preventDefault()
		el.addEventListener('paste', block, true)
		el.addEventListener('drop', block, true)
		el.addEventListener('dragover', stop, true)
		el.addEventListener('beforeinput', onBeforeInput, true)
		el.addEventListener('copy', stop, true)
		el.addEventListener('cut', stop, true)
		return () => {
			el.removeEventListener('paste', block, true)
			el.removeEventListener('drop', block, true)
			el.removeEventListener('dragover', stop, true)
			el.removeEventListener('beforeinput', onBeforeInput, true)
			el.removeEventListener('copy', stop, true)
			el.removeEventListener('cut', stop, true)
		}
	}, [bump])

	async function run() {
		setBusy('running')
		setRunResult(null)
		const res = await runCode(exampleRunRequest(problem, code)).catch(() => null)
		if (res == null) setMessage('Run failed. Try again.')
		else setRunResult(res)
		setBusy(null)
	}
	const passed = runResult?.tests.filter((t) => t.passed).length ?? 0
	const statusText =
		busy === 'running'
			? 'Running…'
			: runResult == null
				? ''
				: runResult.status !== 'completed'
					? 'Your code did not run. Check for errors.'
					: `Public examples passed: ${passed} of ${runResult.tests.length}`

	return (
		<div className={cn(practice.page, practice.workspacePage)} data-workspace>
			<div className={practice.toolbar}>
				<div className={challenge.toolbarTitle}>
					<span className={challenge.toolbarEyebrow}>Daily Exam · Preview</span>
					<span className={challenge.toolbarDate}>Sample problem · nothing is saved</span>
				</div>
				<span className={practice.toolbarSpacer} />
				<span className={challenge.timer} role="timer" aria-label="Time left in the preview">
					<span className={challenge.timerLabel}>{closed ? 'Time is up' : 'Time left'}</span>
					<strong data-low={remaining < 5 * 60_000 ? 'true' : undefined}>
						{formatClock(remaining)}
					</strong>
				</span>
			</div>
			<div className={ws.workspace}>
				<div className={challenge.panes} style={{ '--left': '38%' } as CSSProperties}>
					<section aria-labelledby="pv-title" className={ws.pane}>
						<div className={ws.paneHead}>
							<span className={challenge.headTitle}>Problem</span>
							<span className={challenge.badge}>
								<span className={styles.dot} aria-hidden="true" />
								Monitoring (preview)
							</span>
						</div>
						<div className={cn(ws.paneBody, challenge.problemBody)}>
							<h2 id="pv-title">{problem.title}</h2>
							{problem.statement.map((p) => (
								<p key={p}>{p}</p>
							))}
							<h3>Examples</h3>
							{problem.examples.map((ex, i) => (
								<div key={i} className={challenge.example}>
									{problem.entry}({ex.args.map((a) => JSON.stringify(a)).join(', ')}) →{' '}
									{JSON.stringify(ex.output)}
								</div>
							))}
							<h3>Integrity monitoring</h3>
							{warning ? (
								<p role="alert" className={styles.alert}>
									{warning}{' '}
									<button
										type="button"
										className={challenge.muted}
										onClick={() => setWarning(null)}
									>
										Dismiss
									</button>
								</p>
							) : null}
							<ul className={styles.monitor}>
								<li className={styles.monitorRow}>
									<span>Tab left</span>
									<strong>
										{counts.hidden}× · {counts.hiddenSeconds}s
									</strong>
								</li>
								<li className={styles.monitorRow}>
									<span>Fullscreen exits</span>
									<strong>{counts.fullscreen}</strong>
								</li>
								<li className={styles.monitorRow}>
									<span>Blocked paste / drag</span>
									<strong>{counts.blocked}</strong>
								</li>
								<li className={styles.monitorRow}>
									<span>Window focus changes</span>
									<strong>{counts.blur}</strong>
								</li>
								<li className={styles.monitorRow}>
									<span>Possible screenshot shortcuts</span>
									<strong>{counts.shortcut}</strong>
								</li>
							</ul>
							<p className={challenge.muted} style={{ marginTop: 8 }}>
								Observed in this browser and shown only here. The real exam sends these to the
								server; they are observations, not proof.
							</p>
						</div>
					</section>
					<span />
					<section aria-label="Exam code" className={cn(ws.pane, ws.paneCode)}>
						<div className={ws.paneHead}>
							<div className={ws.fileChip} style={{ paddingLeft: 10 }}>
								<span className={practice.py}>Py</span> {problem.entry}.py
							</div>
							<span className={challenge.runStatus} role="status" aria-live="polite">
								<b>{statusText}</b>
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
							<div ref={editorRef} className={challenge.editorFill}>
								<CodeEditor
									value={code}
									readOnly={closed}
									onChange={setCode}
									ariaLabel="Exam code editor (pasting disabled)"
								/>
							</div>
						</div>
						<div className={challenge.foot}>
							<span className={challenge.runStatus}>
								<span className={challenge.muted}>Preview: not saved to a server</span>
							</span>
							{message ? <span className={challenge.error}>{message}</span> : null}
							{confirming ? (
								<>
									<span className={challenge.confirm}>
										In the real exam this is your one final submission.
									</span>
									<Button
										type="button"
										size="sm"
										onClick={() => router.push('/exam/preview/result')}
									>
										Yes, submit (preview)
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
									className={challenge.submitButton}
									disabled={closed}
									onClick={() => setConfirming(true)}
								>
									Submit final answer
								</Button>
							)}
						</div>
					</section>
				</div>
			</div>
		</div>
	)
}
