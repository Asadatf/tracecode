'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CloseIcon, CopyIcon } from '@/components/ui/icons'
import { PROMPT_CATEGORIES, type PromptCategory } from '@/lib/tutor/prompt-categories'
import styles from './tutor.module.css'

export { PROMPT_CATEGORIES } from '@/lib/tutor/prompt-categories'
export type { PromptCategory } from '@/lib/tutor/prompt-categories'

// "How to ask Tracy" — a compact, accessible help panel of example prompts.
// Opening it does NOT send a message, does NOT make an API request, does NOT
// consume one of the 15 questions in the conversation, and lives entirely
// outside the chat transcript.
//
// Each example has a Copy button that copies the prompt text to the
// clipboard so the learner can paste it into the composer (or type their
// own variant) — the guide never writes into the composer itself. That
// separation keeps the composer as the single source of truth for what
// gets sent.
//
// The `PROMPT_CATEGORIES` array itself lives in `@/lib/tutor/prompt-categories`
// so the data is unit-testable under `node --test` without loading this TSX
// file (the test loader does not do JSX).

export function TutorPromptGuide({
	open,
	onClose,
	anchorId
}: {
	open: boolean
	onClose: () => void
	// The id of the button that toggled this popover — used to restore
	// focus on close.
	anchorId: string
}) {
	const dialogRef = useRef<HTMLDivElement>(null)
	const titleRef = useRef<HTMLHeadingElement>(null)

	// Focus the heading when opened; return focus to the trigger on close.
	useEffect(() => {
		if (!open) return
		titleRef.current?.focus()
		return () => {
			// On teardown restore focus to the trigger.
			requestAnimationFrame(() => document.getElementById(anchorId)?.focus())
		}
	}, [open, anchorId])

	// Close on Escape and keep Tab inside the dialog.
	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key === 'Escape') {
			event.preventDefault()
			event.stopPropagation()
			onClose()
			return
		}
		if (event.key !== 'Tab') return
		const focusables = Array.from(
			dialogRef.current?.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
			) ?? []
		)
		const first = focusables[0]
		const last = focusables[focusables.length - 1]
		if (first == null || last == null) return
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault()
			last.focus()
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault()
			first.focus()
		}
	}

	if (!open) return null

	return (
		<div
			ref={dialogRef}
			className={styles.guide}
			role="dialog"
			aria-modal="true"
			aria-labelledby="tutor-guide-title"
			onKeyDown={onKeyDown}
		>
			<div className={styles.guideHead}>
				<h3 ref={titleRef} tabIndex={-1} id="tutor-guide-title" className={styles.guideTitle}>
					How to ask Tracy
				</h3>
				<button
					type="button"
					className={styles.iconButton}
					aria-label="Close prompt guide"
					onClick={onClose}
				>
					<CloseIcon size={14} />
				</button>
			</div>
			<p className={styles.guideLead}>
				Tracy automatically receives the relevant Practice context — the problem, your current code,
				your latest run and any selected replay step — when you send a question. Nothing is
				transmitted until then.
			</p>
			<ol className={styles.guideList}>
				{PROMPT_CATEGORIES.map((category) => (
					<GuideItem key={category.id} category={category} />
				))}
			</ol>
		</div>
	)
}

function GuideItem({ category }: { category: PromptCategory }) {
	const [copied, setCopied] = useState(false)
	const copy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(category.example)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 1500)
		} catch {
			// Clipboard unavailable (insecure context / denied permission).
			// The example is still visible and selectable; failing silently
			// is preferable to a blocking error on a help surface.
		}
	}, [category.example])

	return (
		<li className={styles.guideItem}>
			<div className={styles.guideItemHead}>
				<span className={styles.guideItemLabel}>{category.label}</span>
				<button
					type="button"
					className={styles.guideCopy}
					onClick={copy}
					aria-label={copied ? `Copied ${category.label} prompt` : `Copy ${category.label} prompt`}
				>
					<CopyIcon size={13} />
					<span>{copied ? 'Copied' : 'Copy'}</span>
				</button>
			</div>
			<p className={styles.guideExample}>{category.example}</p>
		</li>
	)
}
