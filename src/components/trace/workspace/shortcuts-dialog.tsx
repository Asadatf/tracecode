'use client'

import { useEffect, useRef } from 'react'
import { SHORTCUTS, type Platform } from '@/lib/trace/shortcuts'
import styles from './workspace.module.css'

// The list of workspace shortcuts (specs/features/workspace-shortcuts.md, AC4).
// A native modal <dialog>: it traps focus, closes on Escape and returns focus to
// whatever had it before, with no code of ours.
export function ShortcutsDialog({
	open,
	platform,
	onClose
}: {
	open: boolean
	platform: Platform
	onClose: () => void
}) {
	const ref = useRef<HTMLDialogElement>(null)

	useEffect(() => {
		const dialog = ref.current
		if (dialog == null) return
		if (open && !dialog.open) dialog.showModal()
		if (!open && dialog.open) dialog.close()
	}, [open])

	return (
		<dialog
			ref={ref}
			className={styles.shortcuts}
			aria-labelledby="shortcuts-title"
			onClose={onClose}
			onClick={(event) => {
				// A click on the backdrop (outside the card) closes it.
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<h2 id="shortcuts-title">Keyboard shortcuts</h2>
			<dl className={styles.shortcutList}>
				{SHORTCUTS.map((shortcut) => (
					<div key={shortcut.action} className={styles.shortcutRow}>
						<dt>{shortcut.label}</dt>
						<dd>
							<kbd>{shortcut.keys[platform]}</kbd>
						</dd>
					</div>
				))}
			</dl>
			<div className={styles.tourRow}>
				<span className={styles.tourSpacer} />
				<button
					type="button"
					autoFocus
					className={`${styles.tourButton} ${styles.tourPrimary}`}
					onClick={onClose}
				>
					Close
				</button>
			</div>
		</dialog>
	)
}
