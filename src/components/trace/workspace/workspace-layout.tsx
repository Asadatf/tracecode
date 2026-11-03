'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronUpIcon,
	ExpandIcon,
	ShrinkIcon
} from '@/components/ui/icons'
import {
	LAYOUT_DEFAULTS,
	clampLeft,
	clampTop,
	layoutCookie,
	leftLimits,
	stepPercent,
	topLimits,
	type LayoutState
} from '@/lib/trace/workspace-layout'
import styles from './workspace.module.css'

type Maximized = null | 'left' | 'code' | 'results'
type PhoneView = 'problem' | 'code' | 'results'

const KEY_STEP_PX = 16
const KEY_STEP_BIG_PX = 64

export interface WorkspaceLabels {
	collapseChallenge: string
	expandChallenge: string
	collapseResults: string
	expandResults: string
	maximizeChallenge: string
	maximizeCode: string
	maximizeResults: string
	restore: string
	resizeVertical: string
	resizeHorizontal: string
	views: string
	viewProblem: string
	viewCode: string
	viewResults: string
	challenge: string
	results: string
}

// The resizable three-pane workspace (specs/features/practice-workspace-layout.md
// AC4–AC7, AC11–AC12). It owns the sizes and the pane chrome; the parent owns
// what is inside each pane. Sizes are written to a cookie only when a drag or a
// key press ends, never while moving.
export function WorkspaceLayout({
	initial,
	leftHead,
	leftBody,
	codeHead,
	codeBody,
	codeFoot,
	resultsHead,
	resultsBody,
	resultsDot,
	labels
}: {
	initial: LayoutState
	leftHead: ReactNode
	leftBody: ReactNode
	codeHead: ReactNode
	codeBody: ReactNode
	codeFoot?: ReactNode
	resultsHead: ReactNode
	resultsBody: ReactNode
	// Something new in Results, for the phone switcher's dot.
	resultsDot: boolean
	labels: WorkspaceLabels
}) {
	const [layout, setLayout] = useState(initial)
	const [maximized, setMaximized] = useState<Maximized>(null)
	const [phoneView, setPhoneView] = useState<PhoneView>('problem')
	const workspaceRef = useRef<HTMLDivElement>(null)
	const rightRef = useRef<HTMLDivElement>(null)

	function commit(next: LayoutState) {
		setLayout(next)
		document.cookie = layoutCookie(next)
	}

	function startDrag(event: PointerEvent<HTMLButtonElement>, axis: 'x' | 'y') {
		event.preventDefault()
		const handle = event.currentTarget
		handle.setPointerCapture(event.pointerId)
		handle.dataset.drag = 'true'
		let latest = layout
		const move = (moveEvent: globalThis.PointerEvent) => {
			if (axis === 'x') {
				const box = workspaceRef.current?.getBoundingClientRect()
				if (box == null) return
				const pct = clampLeft(((moveEvent.clientX - box.left) / box.width) * 100, box.width)
				latest = { ...latest, left: pct, leftCollapsed: false }
			} else {
				const box = rightRef.current?.getBoundingClientRect()
				if (box == null) return
				const pct = clampTop(((moveEvent.clientY - box.top) / box.height) * 100, box.height)
				latest = { ...latest, top: pct, resultsCollapsed: false }
			}
			setLayout(latest)
		}
		const end = () => {
			handle.removeEventListener('pointermove', move)
			handle.removeEventListener('pointerup', end)
			handle.removeEventListener('pointercancel', end)
			delete handle.dataset.drag
			document.cookie = layoutCookie(latest)
		}
		handle.addEventListener('pointermove', move)
		handle.addEventListener('pointerup', end)
		handle.addEventListener('pointercancel', end)
	}

	function onSplitterKey(event: KeyboardEvent<HTMLButtonElement>, axis: 'x' | 'y') {
		const px = event.shiftKey ? KEY_STEP_BIG_PX : KEY_STEP_PX
		const box = (axis === 'x' ? workspaceRef : rightRef).current?.getBoundingClientRect()
		if (box == null) return
		const size = axis === 'x' ? box.width : box.height
		const limits = axis === 'x' ? leftLimits(size) : topLimits(size)
		const current = axis === 'x' ? layout.left : layout.top
		const before = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
		const after = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
		let value: number | null = null
		if (event.key === before) value = current - stepPercent(px, size)
		else if (event.key === after) value = current + stepPercent(px, size)
		else if (event.key === 'Home') value = limits.min
		else if (event.key === 'End') value = limits.max
		if (event.key === 'Enter') {
			event.preventDefault()
			commit(
				axis === 'x'
					? { ...layout, leftCollapsed: !layout.leftCollapsed }
					: { ...layout, resultsCollapsed: !layout.resultsCollapsed }
			)
			return
		}
		if (value == null) return
		event.preventDefault()
		const clamped = Math.max(limits.min, Math.min(limits.max, value))
		commit(
			axis === 'x'
				? { ...layout, left: clamped, leftCollapsed: false }
				: { ...layout, top: clamped, resultsCollapsed: false }
		)
	}

	function reset(axis: 'x' | 'y') {
		commit(
			axis === 'x'
				? { ...layout, left: LAYOUT_DEFAULTS.left, leftCollapsed: false }
				: { ...layout, top: LAYOUT_DEFAULTS.top, resultsCollapsed: false }
		)
	}

	function toggleMax(which: Exclude<Maximized, null>) {
		setMaximized((current) => (current === which ? null : which))
	}

	// Esc restores a maximized pane, unless focus is in the editor, where Esc
	// is the way out of its Tab trap and must not also change the layout.
	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== 'Escape' || maximized == null) return
		if (event.target instanceof HTMLTextAreaElement) return
		setMaximized(null)
	}

	const leftCollapsed = layout.leftCollapsed && maximized == null
	const resultsCollapsed = layout.resultsCollapsed && maximized == null
	const hideLeft = maximized === 'code' || maximized === 'results'
	const hideRight = maximized === 'left'
	const hideCode = maximized === 'results'
	const hideResults = maximized === 'code'

	const columns = hideRight
		? 'minmax(0, 1fr) 0px 0px'
		: hideLeft
			? '0px 0px minmax(0, 1fr)'
			: leftCollapsed
				? '44px 10px minmax(0, 1fr)'
				: `${layout.left}% 10px minmax(0, 1fr)`
	const rows = hideCode
		? '0px 0px minmax(0, 1fr)'
		: hideResults
			? 'minmax(0, 1fr) 0px 0px'
			: resultsCollapsed
				? 'minmax(0, 1fr) 10px 44px'
				: `${layout.top}% 10px minmax(0, 1fr)`

	return (
		<div className={styles.workspace} data-view={phoneView} onKeyDown={onKeyDown}>
			<div className={styles.views} role="tablist" aria-label={labels.views}>
				{(
					[
						['problem', labels.viewProblem],
						['code', labels.viewCode],
						['results', labels.viewResults]
					] as const
				).map(([view, text]) => (
					<button
						key={view}
						type="button"
						role="tab"
						aria-selected={phoneView === view}
						className={cn(styles.viewTab, phoneView === view && styles.viewTabActive)}
						onClick={() => setPhoneView(view)}
					>
						{text}
						{view === 'results' && resultsDot && phoneView !== 'results' ? (
							<span className={styles.tabDot} aria-hidden="true" />
						) : null}
					</button>
				))}
			</div>

			<div ref={workspaceRef} className={styles.panes} style={{ gridTemplateColumns: columns }}>
				<section
					id="pane-left"
					aria-label={labels.challenge}
					inert={hideLeft}
					className={cn(styles.pane, styles.paneLeft, hideLeft && styles.paneHidden)}
				>
					{leftCollapsed ? (
						<div className={styles.rail}>
							<button
								type="button"
								className={styles.iconButton}
								aria-label={labels.expandChallenge}
								aria-expanded={false}
								onClick={() => commit({ ...layout, leftCollapsed: false })}
							>
								<ChevronRightIcon size={16} />
							</button>
							<span className={styles.railLabel}>{labels.challenge}</span>
						</div>
					) : (
						<>
							<div className={styles.paneHead}>
								<div className={styles.headMain}>{leftHead}</div>
								<button
									type="button"
									className={styles.iconButton}
									aria-label={maximized === 'left' ? labels.restore : labels.maximizeChallenge}
									onClick={() => toggleMax('left')}
								>
									{maximized === 'left' ? <ShrinkIcon size={16} /> : <ExpandIcon size={16} />}
								</button>
								<button
									id="tour-collapse"
									type="button"
									className={styles.iconButton}
									aria-label={labels.collapseChallenge}
									aria-expanded
									onClick={() => commit({ ...layout, leftCollapsed: true })}
								>
									<ChevronLeftIcon size={16} />
								</button>
							</div>
							<div className={styles.paneBody}>{leftBody}</div>
						</>
					)}
				</section>

				<button
					id="tour-split-v"
					type="button"
					role="separator"
					aria-orientation="vertical"
					aria-label={labels.resizeVertical}
					aria-controls="pane-left"
					aria-valuemin={20}
					aria-valuemax={60}
					aria-valuenow={Math.round(layout.left)}
					className={cn(
						styles.splitter,
						styles.splitterV,
						(hideLeft || hideRight) && styles.paneHidden
					)}
					onPointerDown={(event) => startDrag(event, 'x')}
					onKeyDown={(event) => onSplitterKey(event, 'x')}
					onDoubleClick={() => reset('x')}
				/>

				<div
					ref={rightRef}
					className={cn(styles.right, hideRight && styles.paneHidden)}
					style={{ gridTemplateRows: rows }}
				>
					<section
						id="pane-code"
						aria-label="Code"
						inert={hideCode}
						className={cn(styles.pane, styles.paneCode, hideCode && styles.paneHidden)}
					>
						<div className={styles.paneHead}>
							<div className={styles.headMain}>{codeHead}</div>
							<button
								type="button"
								className={styles.iconButton}
								aria-label={maximized === 'code' ? labels.restore : labels.maximizeCode}
								onClick={() => toggleMax('code')}
							>
								{maximized === 'code' ? <ShrinkIcon size={16} /> : <ExpandIcon size={16} />}
							</button>
						</div>
						<div className={styles.paneBody}>{codeBody}</div>
						{codeFoot}
					</section>

					<button
						type="button"
						role="separator"
						aria-orientation="horizontal"
						aria-label={labels.resizeHorizontal}
						aria-controls="pane-code"
						aria-valuemin={30}
						aria-valuemax={75}
						aria-valuenow={Math.round(layout.top)}
						className={cn(
							styles.splitter,
							styles.splitterH,
							(hideCode || hideResults) && styles.paneHidden
						)}
						onPointerDown={(event) => startDrag(event, 'y')}
						onKeyDown={(event) => onSplitterKey(event, 'y')}
						onDoubleClick={() => reset('y')}
					/>

					<section
						id="pane-results"
						aria-label={labels.results}
						inert={hideResults}
						className={cn(styles.pane, styles.paneResults, hideResults && styles.paneHidden)}
					>
						<div className={styles.paneHead}>
							<div className={styles.headMain}>{resultsHead}</div>
							<button
								type="button"
								className={styles.iconButton}
								aria-label={maximized === 'results' ? labels.restore : labels.maximizeResults}
								onClick={() => toggleMax('results')}
							>
								{maximized === 'results' ? <ShrinkIcon size={16} /> : <ExpandIcon size={16} />}
							</button>
							<button
								type="button"
								className={styles.iconButton}
								aria-label={resultsCollapsed ? labels.expandResults : labels.collapseResults}
								aria-expanded={!resultsCollapsed}
								onClick={() => commit({ ...layout, resultsCollapsed: !layout.resultsCollapsed })}
							>
								{resultsCollapsed ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
							</button>
						</div>
						{resultsCollapsed ? null : <div className={styles.paneBody}>{resultsBody}</div>}
					</section>
				</div>
			</div>
		</div>
	)
}
