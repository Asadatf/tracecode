'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import type { TeachingPrompt } from '@/lib/trace/teach'
import styles from './practice.module.css'

const NEXT_LABEL = ['Show what happened', 'Show what to investigate', 'Show a strategy']

// The coach panel. Hints are revealed one at a time, only by the learner's
// action — the full strategy is never shown by default, and no complete
// corrected solution is ever produced. The parent gives this a `key` so a new
// prompt remounts it with the reveal count reset.
export function TeachingPanel({
	prompt,
	onReveal
}: {
	prompt: TeachingPrompt
	onReveal?: (level: number) => void
}) {
	const [revealed, setRevealed] = useState(0)

	if (prompt == null) return null

	if (prompt.kind === 'question') {
		return (
			<div className={styles.coachPanel}>
				<div className={styles.coachMeta}>
					<span className={styles.coachTag}>Think about the failure</span>
				</div>
				<h3>{prompt.title}</h3>
				<p>{prompt.body}</p>
			</div>
		)
	}

	const shown = prompt.hints.slice(0, revealed)
	const canReveal = revealed < prompt.hints.length

	function reveal() {
		const next = revealed + 1
		setRevealed(next)
		onReveal?.(next)
	}

	return (
		<div className={styles.coachPanel}>
			<div className={styles.coachMeta}>
				<span className={styles.coachTag}>Guidance</span>
			</div>
			<h3>{prompt.title}</h3>
			{shown.length === 0 && (
				<p>Rather than the answer, here are progressive hints. Reveal them one at a time.</p>
			)}
			{shown.map((hint) => (
				<div key={hint.level} className={styles.coachHint}>
					<div className={styles.coachHintLabel}>{hint.kind}</div>
					{hint.body}
				</div>
			))}
			{canReveal && (
				<div style={{ marginTop: 12 }}>
					<button type="button" className={cn(styles.btn, styles.btnDark)} onClick={reveal}>
						{NEXT_LABEL[revealed] ?? 'Show more'}
					</button>
				</div>
			)}
		</div>
	)
}
