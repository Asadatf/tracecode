'use client'

import { useState, type FormEvent } from 'react'
import { SendIcon } from '@/components/ui/icons'
import type { TutorAction } from './tutor-types'
import styles from './tutor.module.css'

const ACTIONS: readonly { id: TutorAction; label: string }[] = [
	{ id: 'ask', label: 'Ask a question' },
	{ id: 'hint', label: 'Get a hint' },
	{ id: 'explain-failure', label: 'Explain my failure' }
]

// The suggested actions and the message box. While `connected` is false every
// control is disabled, so nothing here can look operational or send anything.
export function TutorComposer({
	connected,
	onSend,
	onAction
}: {
	connected: boolean
	onSend?: (text: string) => void
	onAction?: (action: TutorAction) => void
}) {
	const [text, setText] = useState('')

	function submit(event: FormEvent) {
		event.preventDefault()
		const message = text.trim()
		if (!connected || message === '') return
		onSend?.(message)
		setText('')
	}

	return (
		<div className={styles.composer}>
			<div className={styles.actions} role="group" aria-label="Suggested actions">
				{ACTIONS.map((action) => (
					<button
						key={action.id}
						type="button"
						className={styles.chip}
						disabled={!connected}
						title={connected ? undefined : 'Available when AI tutoring is connected'}
						onClick={() => onAction?.(action.id)}
					>
						{action.label}
					</button>
				))}
			</div>
			<form className={styles.form} onSubmit={submit}>
				<label htmlFor="tutor-message" className={styles.srOnly}>
					Message to the AI Tutor
				</label>
				<textarea
					id="tutor-message"
					className={styles.input}
					rows={2}
					value={text}
					disabled={!connected}
					placeholder={
						connected ? 'Ask about this problem…' : 'Not available until AI tutoring is connected'
					}
					onChange={(event) => setText(event.target.value)}
				/>
				<button
					type="submit"
					className={styles.send}
					disabled={!connected || text.trim() === ''}
					aria-label="Send message"
				>
					<SendIcon size={16} />
				</button>
			</form>
		</div>
	)
}
