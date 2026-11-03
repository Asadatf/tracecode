'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import Link from 'next/link'
import { authHref } from '@/lib/auth/return-to'
import { MAX_NOTE_CHARS, NOTE_SAVE_DEBOUNCE_MS } from '@/lib/learning/problem-notes'
import { saveProblemNote } from '@/server/actions/notes'
import styles from './practice.module.css'
import own from './notes-panel.module.css'

// Notes per problem (specs/features/problem-notes.md).

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const STATUS_TEXT: Record<SaveState, string> = {
	idle: '',
	saving: 'Saving…',
	saved: 'Saved',
	error: 'Not saved. Retrying when you type again.'
}

// True once the server confirms the note was saved (or cleared).
function sendNote(slug: string, body: string): Promise<boolean> {
	return saveProblemNote({ problemSlug: slug, body }).then(
		(result) => result.ok && result.data.saved,
		() => false
	)
}

export function NotesPanel({
	slug,
	signedIn,
	initialNote
}: {
	slug: string
	signedIn: boolean
	initialNote: string | null
}) {
	const [body, setBody] = useState(initialNote ?? '')
	// The text not yet confirmed saved, or null when nothing is pending.
	const [pending, setPending] = useState<string | null>(null)
	const [status, setStatus] = useState<SaveState>('idle')

	// Save 800 ms after typing stops (AC4); AC5 on failure.
	useEffect(() => {
		if (pending == null) return
		const timer = setTimeout(() => {
			void sendNote(slug, pending).then((ok) => {
				setStatus(ok ? 'saved' : 'error')
				if (ok) setPending((current) => (current === pending ? null : current))
			})
		}, NOTE_SAVE_DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [pending, slug])

	// Leaving the page mid-debounce still saves (AC4, "or leave").
	const flush = useEffectEvent(() => {
		if (pending != null) void sendNote(slug, pending)
	})
	useEffect(() => {
		const onHide = () => flush()
		window.addEventListener('pagehide', onHide)
		return () => {
			window.removeEventListener('pagehide', onHide)
			flush()
		}
	}, [])

	if (!signedIn) {
		return (
			<div className={own.panel}>
				<h2>Notes</h2>
				<p className={styles.description}>
					Sign in to keep notes on problems: the trick that made it click, or what tripped you up.
				</p>
				<Link className={styles.btn} href={authHref('login', `/practice/${slug}`)}>
					Sign in
				</Link>
			</div>
		)
	}

	return (
		<div className={own.panel}>
			<label className={own.label} htmlFor={`note-${slug}`}>
				Your notes on this problem
			</label>
			<textarea
				id={`note-${slug}`}
				className={own.box}
				value={body}
				maxLength={MAX_NOTE_CHARS}
				placeholder="What's the key idea? What tripped you up?"
				onChange={(event) => {
					setBody(event.target.value)
					setPending(event.target.value)
					setStatus('saving')
				}}
			/>
			<div className={own.foot}>
				<span role="status" aria-live="polite" className={status === 'error' ? styles.warn : ''}>
					{STATUS_TEXT[status]}
				</span>
				<span className={own.counter}>
					{body.length} / {MAX_NOTE_CHARS}
				</span>
			</div>
		</div>
	)
}
