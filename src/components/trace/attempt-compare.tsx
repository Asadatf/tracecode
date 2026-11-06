'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { defaultComparePair, hasChanges, lineDiff, tooLongToDiff } from '@/lib/trace/line-diff'
import styles from './practice.module.css'
import own from './attempt-compare.module.css'

// Compare two of this session's attempts (specs/features/compare-attempts.md).

export interface CompareAttempt {
	// "#2 · 1 / 3 passed · 14:05"
	label: string
	source: string
	passed: boolean
}

export function AttemptCompare({
	attempts,
	busy,
	onLoad
}: {
	attempts: readonly CompareAttempt[]
	busy: boolean
	onLoad: (source: string) => void
}) {
	// null until the learner picks: the defaults then follow new attempts (AC3).
	const [choice, setChoice] = useState<[number, number] | null>(null)
	const fallback = defaultComparePair(attempts.map((a) => a.passed))
	if (fallback == null) return null // AC1
	const [from, to] = choice ?? fallback
	const a = attempts[from]
	const b = attempts[to]
	if (a == null || b == null) return null

	function pick(side: 0 | 1, value: number) {
		const next: [number, number] = [from, to]
		next[side] = value
		setChoice(next)
	}

	return (
		<details className={own.compare}>
			<summary>Compare attempts</summary>
			<div className={own.pickers}>
				{(['From', 'To'] as const).map((name, side) => (
					<label key={name} className={own.picker}>
						<span>{name}</span>
						<select
							value={side === 0 ? from : to}
							onChange={(event) => pick(side === 0 ? 0 : 1, Number(event.target.value))}
						>
							{attempts.map((attempt, index) => (
								<option key={index} value={index}>
									{attempt.label}
								</option>
							))}
						</select>
					</label>
				))}
			</div>
			<DiffView a={a.source} b={b.source} />
			<div className={own.actions}>
				<button
					type="button"
					className={styles.btn}
					onClick={() => onLoad(a.source)}
					disabled={busy}
				>
					Load From version
				</button>
				<button
					type="button"
					className={styles.btn}
					onClick={() => onLoad(b.source)}
					disabled={busy}
				>
					Load To version
				</button>
			</div>
		</details>
	)
}

function DiffView({ a, b }: { a: string; b: string }) {
	if (tooLongToDiff(a, b)) return <p className={styles.description}>Too long to compare.</p>
	const diff = lineDiff(a, b)
	if (!hasChanges(diff)) {
		return <p className={styles.description}>No changes between these attempts.</p>
	}
	return (
		<div className={own.diff} role="group" aria-label="Changes between the two attempts">
			{diff.map((line, i) => (
				<div
					key={i}
					className={cn(
						own.row,
						line.kind === 'added' && own.added,
						line.kind === 'removed' && own.removed
					)}
				>
					<span className={own.num}>{line.kind === 'added' ? '' : line.aLine}</span>
					<span className={own.num}>{line.kind === 'removed' ? '' : line.bLine}</span>
					<span className={own.sign} aria-label={signLabel(line.kind)}>
						{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}
					</span>
					<span className={own.text}>{line.text}</span>
				</div>
			))}
		</div>
	)
}

function signLabel(kind: 'same' | 'added' | 'removed'): string | undefined {
	if (kind === 'added') return 'added'
	if (kind === 'removed') return 'removed'
	return undefined
}
