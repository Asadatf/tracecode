'use client'

import { useState, type FormEvent } from 'react'
import { CloseIcon, SendIcon } from '@/components/ui/icons'
import styles from './tutor.module.css'

// The composer: suggested prompts, textarea, send button and the question
// counter. Disabled while a request is pending or the 15-question limit is
// reached — the "Start new chat" affordance lives in the panel, not here.

export function TutorComposer({
	canSend,
	sending,
	limitReached,
	questionsRemaining,
	questionsUsed,
	maxQuestions,
	suggestions = [],
	onSend,
	canStop = false,
	onStop
}: {
	canSend: boolean
	sending: boolean
	limitReached: boolean
	questionsRemaining: number
	questionsUsed: number
	maxQuestions: number
	suggestions?: readonly { id: string; label: string; prompt: string }[]
	onSend: (text: string) => void
	canStop?: boolean
	onStop?: () => void
}) {
	const [text, setText] = useState('')
	const inputDisabled = !canSend || limitReached
	const trimmed = text.trim()
	const sendDisabled = inputDisabled || trimmed.length === 0

	function submit(event: FormEvent) {
		event.preventDefault()
		if (sendDisabled) return
		onSend(trimmed)
		setText('')
	}

	function sendSuggestion(prompt: string) {
		if (!canSend || limitReached) return
		onSend(prompt)
	}

	const placeholder = limitReached
		? 'Chat is full. Start a new chat to keep asking.'
		: sending
			? 'Waiting for Tracy…'
			: canSend
				? 'Ask Tracy about this problem, your code, a failing test or a replay step…'
				: 'Sign in to chat with Tracy.'

	return (
		<div className={styles.composer}>
			{suggestions.length > 0 && !limitReached && (
				<div className={styles.actions} role="group" aria-label="Suggested questions">
					{suggestions.map((s) => (
						<button
							key={s.id}
							type="button"
							className={styles.chip}
							disabled={inputDisabled}
							onClick={() => sendSuggestion(s.prompt)}
						>
							{s.label}
						</button>
					))}
				</div>
			)}
			<form className={styles.form} onSubmit={submit}>
				<label htmlFor="tutor-message" className={styles.srOnly}>
					Message to Tracy
				</label>
				<textarea
					id="tutor-message"
					className={styles.input}
					rows={2}
					value={text}
					disabled={inputDisabled}
					placeholder={placeholder}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && !event.shiftKey && !sendDisabled) {
							event.preventDefault()
							submit(event)
						}
					}}
				/>
				{canStop && onStop != null ? (
					<button
						type="button"
						className={styles.stop}
						onClick={onStop}
						aria-label="Stop generating"
						title="Stop generating"
					>
						<CloseIcon size={16} />
					</button>
				) : (
					<button
						type="submit"
						className={styles.send}
						disabled={sendDisabled}
						aria-label="Send message"
					>
						<SendIcon size={16} />
					</button>
				)}
			</form>
			<div className={styles.statusBar}>
				<span className={styles.counter} aria-live="polite">
					{questionsUsed} / {maxQuestions} questions used
				</span>
				<span>{questionsRemaining} remaining</span>
			</div>
		</div>
	)
}
