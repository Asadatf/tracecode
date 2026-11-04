'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { CloseIcon, ExpandIcon, InfoIcon, ShrinkIcon, SparkleIcon } from '@/components/ui/icons'
import { MAX_QUESTIONS_PER_CONVERSATION } from '@/lib/tutor/types'
import { TutorComposer } from './tutor-composer'
import { TutorConversation } from './tutor-conversation'
import { TutorPromptGuide } from './tutor-prompt-guide'
import type { TutorPanelProps } from './tutor-types'
import styles from './tutor.module.css'

// Branding: the user-facing name is "Tracy" with "AI Tutor" as a subtitle.
// Internal names (component, API route, DB columns, env vars) stay as
// `TutorPanel` / `/api/tutor` / `ai_usage.feature = 'tutor_chat'` — see the
// M8 spec; the rebrand is user-facing only.
const TUTOR_NAME = 'Tracy'
const TUTOR_ROLE = 'AI Tutor'

const FOCUSABLE =
	'button:not([disabled]), [href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The real, wired-up AI Tutor panel (M8). Preserves the existing panel
// shell, keyboard model (Esc restores or closes, Tab trapped inside a drawer
// or phone-mode modal) and the privacy stance: no network request is made
// from here on open — only on send.
export function TutorPanel({
	context,
	mode,
	open,
	maximized,
	onToggleMaximize,
	onClose,
	tutor,
	suggestions = []
}: TutorPanelProps) {
	const panelRef = useRef<HTMLDivElement>(null)
	const headingRef = useRef<HTMLHeadingElement>(null)
	const modal = mode !== 'docked'
	// Prompt-guide popover. Purely client state: opening it never calls
	// the API or consumes a question (M8 UX addition).
	const [guideOpen, setGuideOpen] = useState(false)

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

	const sending = tutor.status.kind === 'sending'
	const streaming = tutor.status.kind === 'streaming'
	const errored = tutor.status.kind === 'error'

	// Fullscreen presentation: when the Tutor is maximized on desktop the
	// pane can get very wide; a chat reading 2 000 px across is harsh. The
	// `panelMax` class constrains conversation/composer content to a
	// comfortable 960 px, centred — the compact docked panel is untouched.
	return (
		<div
			ref={panelRef}
			className={cn(styles.panel, maximized && styles.panelMax)}
			role={modal ? 'dialog' : 'complementary'}
			aria-modal={modal ? true : undefined}
			aria-label={`${TUTOR_NAME} — ${TUTOR_ROLE}`}
			data-maximized={maximized ? 'true' : 'false'}
			onKeyDown={onKeyDown}
		>
			<div className={styles.header}>
				<span className={styles.mark} aria-hidden="true">
					<SparkleIcon size={16} />
				</span>
				<div className={styles.titleWrap}>
					<h2 ref={headingRef} tabIndex={-1} className={styles.title}>
						{TUTOR_NAME}
					</h2>
					<span className={styles.subtitle}>{TUTOR_ROLE}</span>
				</div>
				<button
					id="tutor-guide-trigger"
					type="button"
					className={styles.iconButton}
					aria-label={guideOpen ? 'Close prompt guide' : 'How to ask Tracy'}
					aria-expanded={guideOpen}
					aria-controls="tutor-guide-panel"
					aria-haspopup="dialog"
					onClick={() => setGuideOpen((o) => !o)}
				>
					<InfoIcon size={16} />
				</button>
				<span className={styles.grow} />
				{mode === 'phone' ? null : (
					<button
						type="button"
						className={styles.iconButton}
						aria-label={maximized ? `Restore ${TUTOR_NAME} size` : `Maximize ${TUTOR_NAME}`}
						onClick={onToggleMaximize}
					>
						{maximized ? <ShrinkIcon size={16} /> : <ExpandIcon size={16} />}
					</button>
				)}
				<button
					type="button"
					className={styles.iconButton}
					aria-label={`Close ${TUTOR_NAME}`}
					onClick={onClose}
				>
					<CloseIcon size={16} />
				</button>
			</div>

			{guideOpen && (
				<div id="tutor-guide-panel">
					<TutorPromptGuide
						open={guideOpen}
						onClose={() => setGuideOpen(false)}
						anchorId="tutor-guide-trigger"
					/>
				</div>
			)}

			<div className={styles.context} aria-label="Current problem">
				<span className={styles.contextLabel}>Working on</span>
				<strong>{context.problemTitle}</strong>
				<span className={styles.contextPill}>{context.difficulty}</span>
				{context.runSummary != null ? (
					<span className={styles.contextRun}>Latest run: {context.runSummary}</span>
				) : null}
			</div>

			{!tutor.available && (
				<p className={styles.notice} role="note">
					<strong>Sign in to chat with {TUTOR_NAME}.</strong> Your code and latest run are sent only
					when you ask a question.
				</p>
			)}

			{errored && (
				<div className={styles.errorBox} role="alert">
					<span>{tutor.status.kind === 'error' ? tutor.status.message : ''}</span>
					{tutor.status.kind === 'error' && tutor.status.retryable && (
						<button type="button" onClick={tutor.retry}>
							Try again
						</button>
					)}
				</div>
			)}

			{tutor.limitReached && (
				<div className={styles.limitBox} role="note">
					<span>
						You&apos;ve asked all {MAX_QUESTIONS_PER_CONVERSATION} questions in this chat. Start a
						new chat for this problem.
					</span>
					<button type="button" className={styles.newChat} onClick={tutor.startNew}>
						Start new chat
					</button>
				</div>
			)}

			<TutorConversation
				messages={tutor.messages}
				sending={sending}
				streaming={streaming}
				streamingReply={tutor.streamingReply}
				available={tutor.available}
			/>
			<TutorComposer
				canSend={tutor.canSend}
				sending={sending}
				limitReached={tutor.limitReached}
				questionsRemaining={tutor.questionsRemaining}
				questionsUsed={tutor.questionsUsed}
				maxQuestions={MAX_QUESTIONS_PER_CONVERSATION}
				suggestions={suggestions}
				onSend={tutor.send}
				canStop={tutor.canStop}
				onStop={tutor.stop}
			/>
		</div>
	)
}
