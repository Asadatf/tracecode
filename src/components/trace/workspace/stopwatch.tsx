'use client'

import { useEffect, useState } from 'react'
import { PauseIcon, PlayIcon, ResetIcon, TimerIcon } from '@/components/ui/icons'
import styles from './workspace.module.css'

const TICK_MS = 250

function pad(value: number): string {
	return String(value).padStart(2, '0')
}

export function formatElapsed(ms: number): string {
	const total = Math.floor(ms / 1000)
	return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

// The toolbar stopwatch (practice-workspace-layout AC9). Purely a timer for the
// learner: it never touches a run, a result or anything saved, and it is not
// remembered between visits.
export function Stopwatch({
	labels
}: {
	labels: { timer: string; start: string; pause: string; reset: string }
}) {
	// `banked` is the time kept across pauses; a running stretch adds to it.
	const [banked, setBanked] = useState(0)
	const [elapsed, setElapsed] = useState(0)
	const [running, setRunning] = useState(false)

	useEffect(() => {
		if (!running) return
		const startedAt = Date.now()
		const timer = setInterval(() => setElapsed(banked + Date.now() - startedAt), TICK_MS)
		return () => clearInterval(timer)
	}, [running, banked])

	function toggle() {
		if (running) setBanked(elapsed)
		setRunning(!running)
	}

	return (
		<div className={styles.stopwatch} role="group" aria-label={labels.timer}>
			<TimerIcon size={16} />
			<span className={styles.time} role="timer" aria-live="off">
				{formatElapsed(elapsed)}
			</span>
			<button
				type="button"
				className={styles.swButton}
				aria-label={running ? labels.pause : labels.start}
				aria-pressed={running}
				onClick={toggle}
			>
				{running ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
			</button>
			<button
				type="button"
				className={styles.swButton}
				aria-label={labels.reset}
				onClick={() => {
					setRunning(false)
					setBanked(0)
					setElapsed(0)
				}}
			>
				<ResetIcon size={16} />
			</button>
		</div>
	)
}
