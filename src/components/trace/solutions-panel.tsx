'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import type { ReferenceSolution } from '@/lib/trace/reference-solutions'
import {
	REVEAL_AFTER_FAILED_RUNS,
	comparisonSentence,
	stepLabel,
	type SolutionsAccess,
	type StepCount
} from '@/lib/trace/solutions'
import { highlight, tokenClasses } from './code-editor'
import styles from './practice.module.css'
import own from './solutions-panel.module.css'

// The Solutions tab (specs/features/solutions-tab.md). Engine work stays in the
// workspace, which owns the busy state: this panel asks for a replay through
// `onWatch` and for step counts through `measure`.

interface Comparison {
	// The passing source the numbers were measured for; a new pass makes them stale.
	source: string
	result: { you: StepCount; best: StepCount } | 'error'
}

export function SolutionsPanel({
	access,
	failedRuns,
	solutions,
	optimised,
	passedSource,
	busy,
	onReveal,
	onWatch,
	measure
}: {
	access: SolutionsAccess
	failedRuns: number
	solutions: readonly ReferenceSolution[]
	optimised: ReferenceSolution | undefined
	// The learner's passing code from this session, if any (AC7).
	passedSource: string | null
	busy: boolean
	onReveal: () => void
	onWatch: (solution: ReferenceSolution) => void
	measure: (source: string) => Promise<StepCount | null>
}) {
	const [comparison, setComparison] = useState<Comparison | null>(null)
	const [measuring, setMeasuring] = useState(false)

	if (access !== 'unlocked') {
		return (
			<div className={own.locked}>
				<h2>Solutions</h2>
				<p className={styles.description}>
					Solutions unlock when you pass all the tests, or after {REVEAL_AFTER_FAILED_RUNS}{' '}
					attempts. Trying first is how it sticks.
				</p>
				{access === 'can-reveal' ? (
					<button type="button" className={styles.btn} onClick={onReveal}>
						Show solutions anyway
					</button>
				) : (
					<p className={own.meta}>
						{failedRuns} of {REVEAL_AFTER_FAILED_RUNS} attempts made.
					</p>
				)}
			</div>
		)
	}

	async function compare(source: string) {
		if (optimised == null) return
		setMeasuring(true)
		const you = await measure(source)
		const best = you == null ? null : await measure(optimised.source)
		setMeasuring(false)
		setComparison({
			source,
			result: you != null && best != null ? { you, best } : 'error'
		})
	}

	const current = comparison != null && comparison.source === passedSource ? comparison : null

	return (
		<div className={own.panel}>
			{solutions.map((solution) => (
				<section
					key={solution.name}
					className={own.card}
					aria-labelledby={`solution-${slugify(solution.name)}`}
				>
					<div className={own.cardHead}>
						<h3 id={`solution-${slugify(solution.name)}`}>{solution.name}</h3>
						<span className={cn(own.kind, solution.kind === 'optimized' && own.kindBest)}>
							{solution.kind === 'optimized' ? 'Optimised' : 'Simple'}
						</span>
					</div>
					<p className={own.meta}>
						Time <b>{solution.time}</b> · Space <b>{solution.space}</b>
					</p>
					<p className={own.explanation}>{solution.explanation}</p>
					<div className={own.code} aria-label={`${solution.name} code`} role="group">
						{solution.source
							.trimEnd()
							.split('\n')
							.map((line, i) => (
								<div key={i} className={own.codeLine}>
									<span className={own.codeLn}>{i + 1}</span>
									<span dangerouslySetInnerHTML={{ __html: highlight(line, tokenClasses) }} />
								</div>
							))}
					</div>
					<button
						type="button"
						className={styles.btn}
						onClick={() => onWatch(solution)}
						disabled={busy}
					>
						Watch it run
					</button>
				</section>
			))}

			{passedSource != null && optimised != null ? (
				<section className={own.compare} aria-labelledby="solutions-compare">
					<h3 id="solutions-compare">Your solution vs. the optimised one</h3>
					{current == null ? (
						<>
							<p className={styles.description}>
								Run your passing code and {optimised.name.toLowerCase()} on the same input, and
								count the steps each takes.
							</p>
							<button
								type="button"
								className={styles.btn}
								onClick={() => compare(passedSource)}
								disabled={busy || measuring}
							>
								{measuring ? 'Comparing…' : 'Compare'}
							</button>
						</>
					) : current.result === 'error' ? (
						<p className={styles.warn}>
							Couldn&apos;t run the comparison. Try again after your next run.
						</p>
					) : (
						<CompareBars you={current.result.you} best={current.result.best} />
					)}
				</section>
			) : null}
		</div>
	)
}

function CompareBars({ you, best }: { you: StepCount; best: StepCount }) {
	const most = Math.max(you.steps, best.steps, 1)
	const rows = [
		{ label: 'Your solution', count: you, good: false },
		{ label: 'Optimised', count: best, good: true }
	]
	return (
		<div className={own.bars}>
			{rows.map((row) => (
				<div key={row.label} className={own.barRow}>
					<span>{row.label}</span>
					<span className={own.track} aria-hidden="true">
						<span
							className={cn(own.fill, row.good && own.fillGood)}
							style={{ width: `${Math.max(2, (row.count.steps / most) * 100)}%` }}
						/>
					</span>
					<span className={own.count}>{stepLabel(row.count)}</span>
				</div>
			))}
			<p className={styles.description}>{comparisonSentence(you, best)}</p>
			<p className={own.meta}>
				A step is one line of Python running. Work done inside built-ins like sorted() is not
				counted.
			</p>
		</div>
	)
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
}
