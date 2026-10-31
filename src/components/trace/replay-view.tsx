'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { deriveView } from '@/lib/trace/derive'
import { explainTrace } from '@/lib/trace/explain'
import { formatValue, listItems } from '@/lib/trace/value'
import type { ProblemMeta, Trace } from '@/lib/trace/contract'
import { ArrayView, type ArrayPointer } from './array-view'
import { highlight, tokenClasses } from './code-editor'
import styles from './practice.module.css'

const POINTER_STYLES = [
	{ bg: '#287dba', fg: '#fff' },
	{ bg: '#e49b30', fg: '#17231e' },
	{ bg: '#7a3e9d', fg: '#fff' },
	{ bg: '#b4461e', fg: '#fff' }
]

export function ReplayView({
	trace,
	meta,
	label,
	kind
}: {
	trace: Trace
	meta: ProblemMeta
	label: string
	kind: 'official' | 'custom'
}) {
	const views = useMemo(() => deriveView(trace, meta), [trace, meta])
	const history = useMemo(() => explainTrace(trace, meta), [trace, meta])
	const pointerStyle = useMemo(() => {
		const map: Record<string, { bg: string; fg: string }> = {}
		;(meta.pointerVars ?? []).forEach(([name], i) => {
			map[name] = POINTER_STYLES[i % POINTER_STYLES.length] as { bg: string; fg: string }
		})
		return map
	}, [meta])

	const total = trace.steps.length
	const [step, setStep] = useState(0)
	const [showSteps, setShowSteps] = useState(false)
	const codeRef = useRef<HTMLDivElement>(null)

	// Keep the active line visible by scrolling ONLY the code container (never the
	// page), and only when the line is outside the container's viewport. This
	// cannot resize the panel — its height is fixed in CSS.
	useEffect(() => {
		const container = codeRef.current
		if (container == null) return
		const active = container.querySelector('[data-active-line="true"]')
		if (!(active instanceof HTMLElement)) return
		const c = container.getBoundingClientRect()
		const a = active.getBoundingClientRect()
		if (a.top < c.top) container.scrollTop += a.top - c.top
		else if (a.bottom > c.bottom) container.scrollTop += a.bottom - c.bottom
	}, [step])

	if (total === 0) return <p className={styles.description}>No execution steps were captured.</p>

	const index = Math.min(step, total - 1)
	const current = trace.steps[index]
	const view = views[index]
	const explanation = history[index]
	if (current == null || view == null || explanation == null) return null

	const arrayVar = meta.arrayVar
	const cells = arrayVar != null ? (listItems(current.locals[arrayVar]) ?? []) : []
	const arrayPointers: ArrayPointer[] = view.pointers
		.filter((p) => p.list === arrayVar)
		.map((p) => {
			const s = pointerStyle[p.name] ?? { bg: '#287dba', fg: '#fff' }
			return { name: p.name, index: p.index, bg: s.bg, fg: s.fg }
		})

	const eventLabel =
		current.event === 'return'
			? 'Return event'
			: current.event === 'exception'
				? 'Exception'
				: 'Before line execution'
	const context = `${label} · ${eventLabel} · Actual Python trace`

	function go(next: number) {
		setStep(Math.max(0, Math.min(total - 1, next)))
	}

	return (
		<div className={styles.replay}>
			<div className={styles.replayHead}>
				<div>
					<div className={styles.eyebrow}>Execution lab</div>
					<h2 style={{ margin: '4px 0 0', fontSize: 19, letterSpacing: '-0.5px' }}>
						Watch your code, one step at a time
					</h2>
				</div>
				<div className={styles.replayHeadingActions}>
					{trace.truncated && (
						<span className={styles.truncNote}>Truncated · first {total} steps</span>
					)}
					<span className={styles.pill}>
						Step {index + 1} of {total}
					</span>
					<button
						type="button"
						className={styles.btn}
						onClick={() => setShowSteps((s) => !s)}
						aria-expanded={showSteps}
					>
						All steps {showSteps ? '↑' : '↓'}
					</button>
				</div>
			</div>

			<div className={styles.replayGrid}>
				<div className={styles.traceCode} ref={codeRef}>
					{trace.source.map((line, i) => {
						const on = current.line === i + 1
						return (
							<div
								key={i}
								data-active-line={on ? 'true' : undefined}
								className={cn(styles.traceLine, on && styles.traceLineOn)}
							>
								<span className={styles.ln}>{i + 1}</span>
								<span
									className={styles.traceSource}
									dangerouslySetInnerHTML={{ __html: highlight(line, tokenClasses) }}
								/>
								{on && <span className={styles.inlineNote}>{explanation.body}</span>}
							</div>
						)
					})}
				</div>

				<div className={styles.state}>
					{arrayVar != null && (
						<>
							<h3>Current input</h3>
							<ArrayView cells={cells} pointers={arrayPointers} />
						</>
					)}

					<h3>Live variables</h3>
					<div>
						{Object.entries(current.locals).length === 0 ? (
							<span className={styles.description}>No local variables yet.</span>
						) : (
							Object.entries(current.locals).map(([name, value]) => (
								<span
									key={name}
									className={cn(styles.local, view.changed.includes(name) && styles.localChanged)}
								>
									{name} = {formatValue(value)}
								</span>
							))
						)}
					</div>

					{view.loops.length > 0 && (
						<div className={styles.traceLoopPanel}>
							<h3>Loop position</h3>
							{view.loops.map((loop, i) => {
								const v = loop.variable != null ? current.locals[loop.variable] : undefined
								return (
									<div key={i} className={styles.traceLoopItem}>
										<code>for {loop.variable ?? '…'}</code>
										<span>
											{v != null
												? `${loop.variable} = ${formatValue(v)}`
												: `iteration ${loop.iteration}`}
										</span>
										<small>line {loop.line}</small>
									</div>
								)
							})}
						</div>
					)}

					<div className={styles.divider} />
					<h3>What&apos;s happening</h3>
					<p className={styles.description}>{explanation.body}</p>
				</div>
			</div>

			{showSteps && (
				<div className={styles.stepsInline}>
					<div className={styles.stepsInlineHead}>
						<div>
							<strong>Execution history</strong>
							<p>Every captured Python event. Select any step to jump there.</p>
						</div>
						<span className={styles.description}>
							{total} steps · {kind === 'custom' ? 'Custom input' : 'Test replay'}
						</span>
					</div>
					<ol className={styles.stepsList}>
						{history.map((entry) => (
							<li key={entry.index}>
								<button
									type="button"
									className={cn(styles.stepSummary, entry.index === index && styles.stepSelected)}
									onClick={() => go(entry.index)}
								>
									<span className={styles.summaryIndex}>{entry.index + 1}</span>
									<span className={styles.summaryContent}>
										<strong>
											Line {entry.line}
											{entry.event === 'return'
												? ' · Return'
												: entry.event === 'exception'
													? ' · Exception'
													: ''}
										</strong>
										<span>{entry.body}</span>
									</span>
								</button>
							</li>
						))}
					</ol>
				</div>
			)}

			<div className={styles.replayBottom}>
				<span className={styles.description}>{context}</span>
				<div className={styles.replayNav}>
					<button
						type="button"
						className={styles.btn}
						onClick={() => go(index - 1)}
						disabled={index === 0}
					>
						← Previous
					</button>
					<button
						type="button"
						className={cn(styles.btn, styles.btnDark)}
						onClick={() => go(index + 1)}
						disabled={index === total - 1}
					>
						Next step →
					</button>
				</div>
			</div>
		</div>
	)
}
