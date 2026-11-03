'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import styles from './workspace.module.css'

const STORAGE_KEY = 'tc-practice-tour-v1'
const CHANGE_EVENT = 'tc-practice-tour'
const RING = '3px solid #58d7a2'

// Each step points at a control that exists in the workspace (AC10).
const STEPS = [
	{
		target: 'tour-run',
		title: 'Run code',
		body: 'Runs your Python here in the browser against the real tests.'
	},
	{
		target: 'tour-left-tabs',
		title: 'Tabs',
		body: 'Description, Hints and History live here. Hints unlock after you replay a failing test.'
	},
	{
		target: 'tour-split-v',
		title: 'Splitters',
		body: 'Drag this, or focus it and use the arrow keys, to resize the panes.'
	},
	{
		target: 'tour-collapse',
		title: 'Collapse and maximize',
		body: 'Collapse a pane, or maximize it, to give it the room you need. Esc restores.'
	},
	{
		target: 'tour-results-tabs',
		title: 'Results to Replay',
		body: 'When a test fails, replay it and watch the variables change step by step.'
	}
] as const

let seenInMemory = false

function subscribe(onChange: () => void) {
	window.addEventListener(CHANGE_EVENT, onChange)
	return () => window.removeEventListener(CHANGE_EVENT, onChange)
}
function readSeen(): boolean {
	try {
		return window.localStorage.getItem(STORAGE_KEY) === '1' || seenInMemory
	} catch {
		return seenInMemory
	}
}
function markSeen() {
	seenInMemory = true
	try {
		window.localStorage.setItem(STORAGE_KEY, '1')
	} catch {
		// remembered for this page only
	}
	window.dispatchEvent(new Event(CHANGE_EVENT))
}

// The first-visit tour (practice-workspace-layout AC10). The server snapshot says
// "seen", so nothing renders on the server and there is no hydration mismatch;
// a first-time visitor sees the card right after the page loads. `openSignal`
// is bumped by the toolbar "?" button to start it again.
export function WorkspaceTour({ openSignal }: { openSignal: number }) {
	const seen = useSyncExternalStore(subscribe, readSeen, () => true)
	const [manual, setManual] = useState({ signal: openSignal, open: false })
	const [step, setStep] = useState(0)

	// A new signal from the "?" button reopens the tour at its first step.
	if (manual.signal !== openSignal) {
		setManual({ signal: openSignal, open: true })
		setStep(0)
	}
	const open = manual.open || !seen
	const current = STEPS[step]

	useEffect(() => {
		if (!open || current == null) return
		const element = document.getElementById(current.target)
		if (element == null) return
		const previous = element.style.outline
		element.style.outline = RING
		element.style.outlineOffset = '2px'
		return () => {
			element.style.outline = previous
			element.style.outlineOffset = ''
		}
	}, [open, current])

	function close() {
		setManual((value) => ({ ...value, open: false }))
		markSeen()
	}

	if (!open || current == null) return null

	const last = step === STEPS.length - 1
	return (
		<div
			className={styles.tour}
			role="dialog"
			aria-label={`Tour, step ${step + 1} of ${STEPS.length}`}
			onKeyDown={(event) => {
				if (event.key === 'Escape') close()
			}}
		>
			<h2>{current.title}</h2>
			<p>{current.body}</p>
			<div className={styles.tourRow}>
				<span>
					{step + 1} of {STEPS.length}
				</span>
				<span className={styles.tourSpacer} />
				<button type="button" className={styles.tourButton} onClick={close}>
					Skip tour
				</button>
				{step > 0 ? (
					<button type="button" className={styles.tourButton} onClick={() => setStep(step - 1)}>
						Back
					</button>
				) : null}
				<button
					type="button"
					autoFocus
					className={`${styles.tourButton} ${styles.tourPrimary}`}
					onClick={() => (last ? close() : setStep(step + 1))}
				>
					{last ? 'Done' : 'Next'}
				</button>
			</div>
		</div>
	)
}
