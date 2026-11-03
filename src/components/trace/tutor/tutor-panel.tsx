'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { CloseIcon, ExpandIcon, ShrinkIcon, SparkleIcon } from '@/components/ui/icons'
import { TutorComposer } from './tutor-composer'
import { TutorConversation } from './tutor-conversation'
import type { TutorPanelProps } from './tutor-types'
import styles from './tutor.module.css'

const FOCUSABLE =
	'button:not([disabled]), [href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The on-demand AI Tutor (practice-workspace-layout AC16–AC24): a preview of the
// interface only. It is honest about that: a "Not connected" badge, a notice,
// disabled controls and an empty conversation. Escape closes it (or restores it
// first when maximized); as a drawer or full-screen panel it behaves as a dialog
// and keeps Tab inside until it is closed.
export function TutorPanel({
	context,
	mode,
	open,
	maximized,
	onToggleMaximize,
	onClose,
	connected = false,
	messages = [],
	onSend,
	onAction
}: TutorPanelProps) {
	const panelRef = useRef<HTMLDivElement>(null)
	const headingRef = useRef<HTMLHeadingElement>(null)
	const modal = mode !== 'docked'

	// Opening moves focus to the panel's heading, so a keyboard user lands inside it.
	useEffect(() => {
		if (open) headingRef.current?.focus()
	}, [open])

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key === 'Escape') {
			event.preventDefault()
			event.stopPropagation()
			if (maximized && mode !== 'phone') onToggleMaximize()
			else onClose()
			return
		}
		if (event.key !== 'Tab' || !modal) return
		const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
		const first = items[0]
		const last = items[items.length - 1]
		if (first == null || last == null) return
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault()
			last.focus()
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault()
			first.focus()
		}
	}

	return (
		<div
			ref={panelRef}
			className={styles.panel}
			role={modal ? 'dialog' : 'complementary'}
			aria-modal={modal ? true : undefined}
			aria-label="AI Tutor"
			onKeyDown={onKeyDown}
		>
			<div className={styles.header}>
				<span className={styles.mark} aria-hidden="true">
					<SparkleIcon size={16} />
				</span>
				<h2 ref={headingRef} tabIndex={-1} className={styles.title}>
					AI Tutor
				</h2>
				<span className={styles.badge}>Not connected</span>
				<span className={styles.grow} />
				{mode === 'phone' ? null : (
					<button
						type="button"
						className={styles.iconButton}
						aria-label={maximized ? 'Restore AI Tutor size' : 'Maximize AI Tutor'}
						onClick={onToggleMaximize}
					>
						{maximized ? <ShrinkIcon size={16} /> : <ExpandIcon size={16} />}
					</button>
				)}
				<button
					type="button"
					className={styles.iconButton}
					aria-label="Close AI Tutor"
					onClick={onClose}
				>
					<CloseIcon size={16} />
				</button>
			</div>

			<div className={styles.context} aria-label="Current problem">
				<span className={styles.contextLabel}>Working on</span>
				<strong>{context.problemTitle}</strong>
				<span className={styles.contextPill}>{context.difficulty}</span>
				{context.runSummary != null ? (
					<span className={styles.contextRun}>Latest run: {context.runSummary}</span>
				) : null}
			</div>

			{connected ? null : (
				<p className={styles.notice} role="note">
					<strong>AI tutoring isn’t connected yet.</strong> This is a preview of the panel. Nothing
					you type here is sent anywhere, and there are no AI replies.
				</p>
			)}

			<TutorConversation messages={messages} connected={connected} />
			<TutorComposer connected={connected} onSend={onSend} onAction={onAction} />
		</div>
	)
}
