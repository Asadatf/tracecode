'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { deriveView } from '@/lib/trace/derive'
import { explainTrace } from '@/lib/trace/explain'
import {
	condenseTrace,
	describeRun,
	runAhead,
	stepFrom,
	type RepeatRun
} from '@/lib/trace/condense'
import { formatValue, listItems } from '@/lib/trace/value'
import type { ProblemMeta, Trace } from '@/lib/trace/contract'
import { ArrayView, type ArrayPointer } from './array-view'
import { highlight, tokenClasses } from './code-editor'
import styles from './practice.module.css'

const KIND_LABEL = {
	official: 'Test replay',
	custom: 'Custom input',
	// specs/features/solutions-tab.md, AC6
	solution: 'Solution replay'
} as const

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
	kind,
	part = 'all',
	step: controlledStep,
	onStepChange
}: {
	trace: Trace
	meta: ProblemMeta
	label: string
	kind: 'official' | 'custom' | 'solution'
	// 'all' is the original single panel. 'pane' is the same content sized to
	// fill a workspace pane. 'trace' and 'variables' show the two halves apart;
	// a parent that shows both owns the step so they stay in sync.
	part?: 'all' | 'trace' | 'variables' | 'pane'
	step?: number
	onStepChange?: (step: number) => void
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
	const [ownStep, setOwnStep] = useState(0)
	const step = controlledStep ?? ownStep
	const setStep = onStepChange ?? setOwnStep
	const [showSteps, setShowSteps] = useState(false)
	// Repeated passes of a loop or recursion are folded by default (src/lib/trace/condense.ts):
	// a few passes, then one summary. `full` shows every recorded step everywhere; `openRuns`
	// opens single folds. Nothing is removed from the trace, only collapsed in the display.
	const runs = useMemo(() => condenseTrace(trace), [trace])
	const [full, setFull] = useState(false)
	const [openRuns, setOpenRuns] = useState<ReadonlySet<number>>(() => new Set())
	const isOpen = (run: RepeatRun) => full || openRuns.has(run.id)
	function toggleRun(run: RepeatRun) {
		setOpenRuns((current) => {
			const next = new Set(current)
			if (next.has(run.id)) next.delete(run.id)
			else next.add(run.id)
			return next
		})
	}
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
	// Previous / Next skip the steps of a folded run; a fold you are inside stays readable.
	function move(direction: 1 | -1) {
		setStep(stepFrom(runs, index, direction, total, isOpen))
	}
	const skippingNext = runAhead(runs, index, 1, isOpen)
	const skippingPrevious = runAhead(runs, index, -1, isOpen)
	const skipping = skippingNext ?? skippingPrevious

	const compactHead = (
		<div className={styles.replayHead}>
			<div className={styles.replayHeadingActions}>
				{trace.truncated && (
					<span className={styles.truncNote}>Truncated · first {total} steps</span>
				)}
				<span className={styles.pill}>
					Step {index + 1} of {total}
				</span>
				{runs.length > 0 && (
					<button
						type="button"
						className={styles.btn}
						onClick={() => setFull((value) => !value)}
						aria-pressed={full}
						title="Fold repeated passes, or show every recorded step"
					>
						{full ? 'Fold repeats' : 'Show full trace'}
					</button>
				)}
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
	)

	const traceBlock = (
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
	)

	const stateBlock = (
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
							<span className={styles.localName}>{name}</span> ={' '}
							<span className={styles.localValue}>{formatValue(value)}</span>
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
	)

	// The execution history. Folded runs are ONE row each (a button that opens them); every other
	// step is its own row, so the default list is short and the full trace is one click away.
	const rows: React.ReactNode[] = []
	for (let i = 0; i < history.length; i += 1) {
		const run = runs.find((r) => r.hiddenFrom === i)
		if (run != null && !isOpen(run)) {
			const words = describeRun(run)
			rows.push(
				<li key={`run-${run.id}`}>
					<button
						type="button"
						className={cn(styles.stepSummary, styles.stepFold)}
						onClick={() => toggleRun(run)}
						aria-expanded={false}
						aria-controls={`fold-${run.id}`}
					>
						<span className={styles.summaryIndex}>⋯</span>
						<span className={styles.summaryContent}>
							<strong>{words.summary}</strong>
							<span>
								{words.detail} Steps {run.hiddenFrom + 1}–{run.hiddenTo + 1} ({run.hiddenSteps}{' '}
								steps) are folded. Press to show them.
							</span>
						</span>
					</button>
				</li>
			)
			i = run.hiddenTo
			continue
		}
		const open = runs.find((r) => i >= r.hiddenFrom && i <= r.hiddenTo && isOpen(r))
		if (open != null && i === open.hiddenFrom && !full) {
			rows.push(
				<li key={`open-${open.id}`}>
					<button
						type="button"
						className={cn(styles.stepSummary, styles.stepFold)}
						onClick={() => toggleRun(open)}
						aria-expanded={true}
						aria-controls={`fold-${open.id}`}
					>
						<span className={styles.summaryIndex}>⋯</span>
						<span className={styles.summaryContent}>
							<strong>Showing every step of the repeated section</strong>
							<span>{open.hiddenSteps} steps. Press to fold them again.</span>
						</span>
					</button>
				</li>
			)
		}
		const entry = history[i]
		if (entry == null) continue
		rows.push(
			<li
				key={entry.index}
				id={open != null && i === open.hiddenFrom ? `fold-${open.id}` : undefined}
			>
				<button
					type="button"
					className={cn(styles.stepSummary, entry.index === index && styles.stepSelected)}
					onClick={() => go(entry.index)}
					aria-current={entry.index === index ? 'step' : undefined}
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
		)
	}

	const stepsBlock = (
		<div className={styles.stepsInline}>
			<div className={styles.stepsInlineHead}>
				<div>
					<strong>Execution history</strong>
					<p>
						{runs.length > 0 && !full
							? 'Repeated passes are folded. Every captured Python event is still here: open a fold or show the full trace.'
							: 'Every captured Python event. Select any step to jump there.'}
					</p>
				</div>
				<span className={styles.description}>
					{total} steps · {KIND_LABEL[kind]}
				</span>
			</div>
			<ol className={styles.stepsList}>{rows}</ol>
		</div>
	)

	// A short, polite note when Next / Previous would jump over a fold, with the way to see it.
	const skipNote =
		skipping != null && !full ? (
			<p className={styles.foldNote} role="status">
				{describeRun(skipping).summary} ({skipping.hiddenSteps} steps are skipped).{' '}
				<button type="button" className={styles.foldLink} onClick={() => toggleRun(skipping)}>
					Show every step
				</button>
			</p>
		) : null

	const bottomBlock = (
		<div className={styles.replayBottom}>
			<span className={styles.description}>{context}</span>
			{skipNote}
			<div className={styles.replayNav}>
				<button
					type="button"
					className={styles.btn}
					onClick={() => move(-1)}
					disabled={index === 0}
				>
					← Previous
				</button>
				<button
					type="button"
					className={cn(styles.btn, styles.btnDark)}
					onClick={() => move(1)}
					disabled={index === total - 1}
				>
					Next step →
				</button>
			</div>
		</div>
	)

	// The workspace's Replay tab: traced code and the variables side by side,
	// filling the pane instead of using the fixed panel heights.
	if (part === 'pane') {
		return (
			<div className={cn(styles.replay, styles.replayFill)}>
				{compactHead}
				{showSteps ? (
					stepsBlock
				) : (
					<div className={styles.replayGrid}>
						{traceBlock}
						{stateBlock}
					</div>
				)}
				{bottomBlock}
			</div>
		)
	}
	if (part === 'variables') {
		return <div className={cn(styles.replay, styles.replayFill)}>{stateBlock}</div>
	}
	if (part === 'trace') {
		return (
			<div className={cn(styles.replay, styles.replayFill)}>
				{compactHead}
				{showSteps ? stepsBlock : traceBlock}
				{bottomBlock}
			</div>
		)
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
				{compactHead}
			</div>

			<div className={styles.replayGrid}>
				{traceBlock}
				{stateBlock}
			</div>

			{showSteps && stepsBlock}

			{bottomBlock}
		</div>
	)
}
