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
	clampTutor,
	layoutCookie,
	leftLimits,
	stepPercent,
	topLimits,
	tutorLimits,
	type LayoutState
} from '@/lib/trace/workspace-layout'
import type { TutorMode } from '../tutor/tutor-types'
import { useViewportMode } from './viewport-mode'
import styles from './workspace.module.css'

type Maximized = null | 'left' | 'code' | 'results' | 'tutor'
type PhoneView = 'problem' | 'code' | 'results'

const KEY_STEP_PX = 16
const KEY_STEP_BIG_PX = 64

export interface WorkspaceLabels {
	collapseChallenge: string
	expandChallenge: string
	collapseResults: string
	collapseCode: string
	expandCode: string
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
	tutor: string
	resizeTutor: string
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
	tutorOpen,
	renderTutor,
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
	// The AI Tutor column. It stays mounted while closed, so opening and closing it
	// never touches the panes, and the parent keeps owning all workspace state.
	tutorOpen: boolean
	renderTutor: (api: {
		mode: TutorMode
		maximized: boolean
		toggleMaximize: () => void
	}) => ReactNode
	labels: WorkspaceLabels
}) {
	const [layout, setLayout] = useState(initial)
	const [maximized, setMaximized] = useState<Maximized>(null)
	const [phoneView, setPhoneView] = useState<PhoneView>('problem')
	const viewport = useViewportMode()
	const workspaceRef = useRef<HTMLDivElement>(null)
	const rightRef = useRef<HTMLDivElement>(null)

	// Closing the Tutor drops its maximized state, so it reopens at its normal size.
	if (!tutorOpen && maximized === 'tutor') setMaximized(null)
	const docked = tutorOpen && viewport === 'wide'
	const tutorMode: TutorMode = viewport === 'wide' ? 'docked' : viewport

	function commit(next: LayoutState) {
		setLayout(next)
		document.cookie = layoutCookie(next)
	}

	function startDrag(event: PointerEvent<HTMLButtonElement>, axis: 'x' | 'y' | 't') {
		event.preventDefault()
		const handle = event.currentTarget
		handle.setPointerCapture(event.pointerId)
		handle.dataset.drag = 'true'
		let latest = layout
		const move = (moveEvent: globalThis.PointerEvent) => {
			if (axis === 'x') {
				const box = workspaceRef.current?.getBoundingClientRect()
				if (box == null) return
				const pct = clampLeft(
					((moveEvent.clientX - box.left) / box.width) * 100,
					box.width,
					docked ? latest.tutor : 0
				)
				latest = { ...latest, left: pct, leftCollapsed: false }
			} else if (axis === 't') {
				const box = workspaceRef.current?.getBoundingClientRect()
				if (box == null) return
				const pct = clampTutor(
					((box.right - moveEvent.clientX) / box.width) * 100,
					box.width,
					latest.left,
					latest.leftCollapsed
				)
				latest = { ...latest, tutor: pct }
			} else {
				const box = rightRef.current?.getBoundingClientRect()
				if (box == null) return
				const pct = clampTop(((moveEvent.clientY - box.top) / box.height) * 100, box.height)
				latest = { ...latest, top: pct, resultsCollapsed: false, codeCollapsed: false }
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

	function onSplitterKey(event: KeyboardEvent<HTMLButtonElement>, axis: 'x' | 'y' | 't') {
		const px = event.shiftKey ? KEY_STEP_BIG_PX : KEY_STEP_PX
		const box = (axis === 'y' ? rightRef : workspaceRef).current?.getBoundingClientRect()
		if (box == null) return
		const size = axis === 'y' ? box.height : box.width
		const limits =
			axis === 'x'
				? leftLimits(size, docked ? layout.tutor : 0)
				: axis === 'y'
					? topLimits(size)
					: tutorLimits(size, layout.left, layout.leftCollapsed)
		const current = axis === 'x' ? layout.left : axis === 'y' ? layout.top : layout.tutor
		// Moving the right-hand splitter left makes the Tutor column wider.
		const grow = axis === 'x' ? 'ArrowRight' : axis === 'y' ? 'ArrowDown' : 'ArrowLeft'
		const shrink = axis === 'x' ? 'ArrowLeft' : axis === 'y' ? 'ArrowUp' : 'ArrowRight'
		let value: number | null = null
		if (event.key === grow) value = current + stepPercent(px, size)
		else if (event.key === shrink) value = current - stepPercent(px, size)
		else if (event.key === 'Home') value = limits.min
		else if (event.key === 'End') value = limits.max
		if (event.key === 'Enter' && axis !== 't') {
			event.preventDefault()
			commit(
				axis === 'x'
					? { ...layout, leftCollapsed: !layout.leftCollapsed }
					: layout.codeCollapsed
						? { ...layout, codeCollapsed: false }
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
				: axis === 'y'
					? { ...layout, top: clamped, resultsCollapsed: false, codeCollapsed: false }
					: { ...layout, tutor: clamped }
		)
	}

	function reset(axis: 'x' | 'y' | 't') {
		commit(
			axis === 'x'
				? { ...layout, left: LAYOUT_DEFAULTS.left, leftCollapsed: false }
				: axis === 'y'
					? { ...layout, top: LAYOUT_DEFAULTS.top, resultsCollapsed: false, codeCollapsed: false }
					: { ...layout, tutor: LAYOUT_DEFAULTS.tutor }
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
	const codeCollapsed = layout.codeCollapsed && maximized == null
	// A docked Tutor maximized takes the whole workspace; as a drawer it just fills itself.
	const tutorFills = docked && maximized === 'tutor'
	const hideLeft = maximized === 'code' || maximized === 'results' || tutorFills
	const hideRight = maximized === 'left' || tutorFills
	const hideCode = maximized === 'results'
	const hideResults = maximized === 'code'
	const tutorHidden = !tutorOpen || (maximized != null && maximized !== 'tutor')
	const showTutorSplitter = docked && maximized == null

	const leftTrack = leftCollapsed ? '44px' : `${layout.left}%`
	const columns = tutorFills
		? '0px 0px 0px 0px minmax(0, 1fr)'
		: maximized === 'left'
			? 'minmax(0, 1fr) 0px 0px 0px 0px'
			: hideLeft
				? '0px 0px minmax(0, 1fr) 0px 0px'
				: `${leftTrack} 10px minmax(0, 1fr) ${docked ? `10px ${layout.tutor}%` : '0px 0px'}`
	const rows = hideCode
		? '0px 0px minmax(0, 1fr)'
		: hideResults
			? 'minmax(0, 1fr) 0px 0px'
			: codeCollapsed
				? '44px 10px minmax(0, 1fr)'
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
							<button
								type="button"
								className={styles.iconButton}
								aria-label={codeCollapsed ? labels.expandCode : labels.collapseCode}
								aria-expanded={!codeCollapsed}
								onClick={() =>
									commit({
										...layout,
										codeCollapsed: !layout.codeCollapsed,
										resultsCollapsed: false
									})
								}
							>
								{codeCollapsed ? <ChevronDownIcon size={16} /> : <ChevronUpIcon size={16} />}
							</button>
						</div>
						{codeCollapsed ? null : <div className={styles.paneBody}>{codeBody}</div>}
						{codeCollapsed ? null : codeFoot}
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
								onClick={() =>
									commit({
										...layout,
										resultsCollapsed: !layout.resultsCollapsed,
										codeCollapsed: false
									})
								}
							>
								{resultsCollapsed ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
							</button>
						</div>
						{resultsCollapsed ? null : <div className={styles.paneBody}>{resultsBody}</div>}
					</section>
				</div>

				<button
					id="tutor-splitter"
					type="button"
					role="separator"
					aria-orientation="vertical"
					aria-label={labels.resizeTutor}
					aria-controls="pane-tutor"
					aria-valuemin={20}
					aria-valuemax={45}
					aria-valuenow={Math.round(layout.tutor)}
					className={cn(styles.splitter, styles.splitterV, !showTutorSplitter && styles.paneHidden)}
					onPointerDown={(event) => startDrag(event, 't')}
					onKeyDown={(event) => onSplitterKey(event, 't')}
					onDoubleClick={() => reset('t')}
				/>

				<section
					id="pane-tutor"
					aria-label={labels.tutor}
					inert={tutorHidden}
					className={cn(
						styles.pane,
						styles.paneTutor,
						tutorOpen && !docked && styles.paneTutorFloating,
						tutorOpen && !docked && maximized === 'tutor' && styles.paneTutorFull,
						tutorHidden && styles.paneHidden
					)}
				>
					{renderTutor({
						mode: tutorMode,
						maximized: maximized === 'tutor',
						toggleMaximize: () => toggleMax('tutor')
					})}
				</section>
			</div>
		</div>
	)
}
