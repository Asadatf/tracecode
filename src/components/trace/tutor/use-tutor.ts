'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
	clearConversation,
	generateId,
	loadConversation,
	newConversation,
	saveConversation,
	type StoredConversation
} from '@/lib/tutor/conversation-store'
import {
	MAX_QUESTIONS_PER_CONVERSATION,
	type TutorContext,
	type TutorMessage,
	type TutorRequest
} from '@/lib/tutor/types'

// Client-side orchestration for one (user, problem) conversation.
//
// Streaming model (M8 final pass):
//   - `send(text)` POSTs to /api/tutor; the response is an NDJSON stream.
//   - The learner's user message is added optimistically to the on-screen
//     transcript BUT not yet committed to sessionStorage.
//   - Incoming `delta` events accumulate into `streamingAssistantText`,
//     which the panel renders as a tentative assistant message.
//   - Deltas are batched with requestAnimationFrame so React re-renders
//     at most once per paint instead of once per token.
//   - On `done`, the aggregated text is committed as a real message, the
//     counter advances, and sessionStorage is written.
//   - On `error`, `aborted` by the user, or a dropped connection, the
//     optimistic user message is rolled back and `lastFailedText` holds
//     the text for retry. The question counter is NOT advanced.
//   - A single `inFlightRef` + `AbortController` prevents concurrent sends
//     and lets Stop generate a clean abort.
//   - Switching (user, problem) aborts the active stream — a stale
//     response never arrives in a different problem's chat.
//
// Nothing here calls OpenAI directly; the key stays server-only.

export interface UseTutorArgs {
	userId: string | null
	problemSlug: string
	buildContext: () => TutorContext
}

export type TutorUiStatus =
	| { kind: 'idle' }
	| { kind: 'sending' } // waiting for first byte
	| { kind: 'streaming' } // receiving deltas
	| { kind: 'error'; message: string; retryable: boolean }

export interface UseTutor {
	messages: TutorMessage[]
	// Tentative in-flight assistant reply, or null when idle. The panel
	// renders this as an extra message at the bottom while the stream is
	// alive.
	streamingReply: string | null
	questionsUsed: number
	questionsRemaining: number
	status: TutorUiStatus
	limitReached: boolean
	canSend: boolean
	canStop: boolean
	send: (text: string) => void
	stop: () => void
	retry: () => void
	startNew: () => void
	available: boolean
}

type StreamEvent =
	| { type: 'start' }
	| { type: 'delta'; text: string }
	| { type: 'done' }
	| { type: 'aborted' }
	| { type: 'error'; reason: string; message: string }

// Reader loop lives OUTSIDE the hook so React Compiler doesn't have to
// lower a nested try/catch + optional-chain combination it cannot handle
// yet. Plain async function — the hook passes it callbacks for the three
// things the UI cares about (first byte, each delta, terminal event).
async function readNdjsonStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	callbacks: {
		onStart: () => void
		onDelta: (text: string) => void
	}
): Promise<{ aggregated: string; terminal: StreamEvent | null; readError: boolean }> {
	const decoder = new TextDecoder()
	let carry = ''
	let aggregated = ''
	let terminal: StreamEvent | null = null
	let readError = false
	try {
		while (true) {
			const { value, done } = await reader.read()
			if (done) break
			carry += decoder.decode(value, { stream: true })
			let nl: number
			while ((nl = carry.indexOf('\n')) >= 0) {
				const line = carry.slice(0, nl).trim()
				carry = carry.slice(nl + 1)
				if (line === '') continue
				let ev: StreamEvent
				try {
					ev = JSON.parse(line) as StreamEvent
				} catch {
					continue // malformed line — skip, don't abort
				}
				if (ev.type === 'start') {
					callbacks.onStart()
				} else if (ev.type === 'delta') {
					aggregated += ev.text
					callbacks.onDelta(ev.text)
				} else if (ev.type === 'done' || ev.type === 'aborted' || ev.type === 'error') {
					terminal = ev
				}
			}
		}
	} catch {
		readError = true
	}
	return { aggregated, terminal, readError }
}

export function useTutor({ userId, problemSlug, buildContext }: UseTutorArgs): UseTutor {
	const available = userId != null
	const [conversation, setConversation] = useState<StoredConversation>(() =>
		userId != null
			? (loadConversation(userId, problemSlug) ?? newConversation())
			: newConversation()
	)
	const [status, setStatus] = useState<TutorUiStatus>({ kind: 'idle' })
	const [pending, setPending] = useState(false)
	const [streamingReply, setStreamingReply] = useState<string | null>(null)
	const [lastFailedText, setLastFailedText] = useState<string | null>(null)

	// The latest buildContext — read at send-time only, from within a
	// callback (never during render).
	const buildContextRef = useRef<() => TutorContext>(buildContext)
	useEffect(() => {
		buildContextRef.current = buildContext
	}, [buildContext])

	// Race guard. Also holds the AbortController so `stop()` can fire from
	// outside the send path.
	const inFlightRef = useRef(false)
	const controllerRef = useRef<AbortController | null>(null)
	// Throttled delta commit: deltas accumulate into this buffer and are
	// drained once per animation frame. One React re-render per paint,
	// not one per token.
	const deltaBufferRef = useRef<string>('')
	const rafRef = useRef<number | null>(null)
	const flush = useCallback(() => {
		const chunk = deltaBufferRef.current
		if (chunk.length === 0) return
		deltaBufferRef.current = ''
		setStreamingReply((prev) => (prev ?? '') + chunk)
	}, [])
	const scheduleFlush = useCallback(() => {
		if (rafRef.current != null) return
		const raf = typeof window !== 'undefined' ? window.requestAnimationFrame : null
		if (raf == null) {
			flush()
			return
		}
		rafRef.current = raf(() => {
			rafRef.current = null
			flush()
		})
	}, [flush])

	// Rehydrate on namespace change — state reset through the "reset state
	// when a prop changes" pattern (no setState inside an effect).
	const namespaceKey = userId == null ? `_anon_:${problemSlug}` : `${userId}:${problemSlug}`
	const [prevKey, setPrevKey] = useState(namespaceKey)
	if (prevKey !== namespaceKey) {
		setPrevKey(namespaceKey)
		const restored =
			userId != null
				? (loadConversation(userId, problemSlug) ?? newConversation())
				: newConversation()
		setConversation(restored)
		setStatus({ kind: 'idle' })
		setPending(false)
		setStreamingReply(null)
		setLastFailedText(null)
	}

	// Abort any in-flight stream when the (user, problem) pair changes AND
	// on unmount. Ref access lives inside an effect, satisfying the
	// react-hooks/refs rule and matching the spec requirement that a stale
	// response never reaches a different problem's chat.
	useEffect(() => {
		return () => {
			controllerRef.current?.abort()
			controllerRef.current = null
			inFlightRef.current = false
			deltaBufferRef.current = ''
		}
	}, [namespaceKey])

	const persist = useCallback(
		(next: StoredConversation) => {
			if (userId != null) saveConversation(userId, problemSlug, next)
			setConversation(next)
		},
		[userId, problemSlug]
	)

	const runRequest = useCallback(
		async (userMessageText: string, baseConversation: StoredConversation) => {
			if (userId == null) return
			inFlightRef.current = true
			const controller = new AbortController()
			controllerRef.current = controller
			setPending(true)
			setStatus({ kind: 'sending' })
			setStreamingReply('')
			deltaBufferRef.current = ''

			const userMessage: TutorMessage = {
				id: generateId(),
				role: 'user',
				text: userMessageText,
				createdAt: new Date().toISOString()
			}
			const pendingTranscript = [...baseConversation.messages, userMessage]
			// Optimistic user message, not persisted yet — on failure or
			// cancel we roll it back and offer retry.
			persist({
				...baseConversation,
				messages: pendingTranscript,
				updatedAt: new Date().toISOString()
			})

			let context: TutorContext = {}
			const safeBuild = buildContextRef.current
			try {
				context = safeBuild()
			} catch {
				context = {}
			}

			const payload: TutorRequest = {
				problemSlug,
				conversationId: baseConversation.conversationId,
				messages: pendingTranscript.map((m) => ({ id: m.id, role: m.role, text: m.text })),
				context
			}

			const failWith = (text: string, message: string, retryable: boolean) => {
				persist({ ...baseConversation, updatedAt: new Date().toISOString() })
				setLastFailedText(text)
				setStatus({ kind: 'error', message, retryable })
				setStreamingReply(null)
				deltaBufferRef.current = ''
			}

			const rollbackAsCancelled = () => {
				persist({ ...baseConversation, updatedAt: new Date().toISOString() })
				setLastFailedText((text) => text ?? userMessageText) // preserve for retry
				setLastFailedText(userMessageText)
				setStatus({ kind: 'idle' })
				setStreamingReply(null)
				deltaBufferRef.current = ''
			}

			// Fetch the stream. If the connection itself fails, mapped as network.
			let res: Response
			try {
				res = await fetch('/api/tutor', {
					method: 'POST',
					signal: controller.signal,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				})
			} catch {
				if (controller.signal.aborted) rollbackAsCancelled()
				else
					failWith(
						userMessageText,
						'Could not reach the tutor. Check your connection and try again.',
						true
					)
				setPending(false)
				inFlightRef.current = false
				controllerRef.current = null
				return
			}

			const contentType = res.headers.get('content-type') ?? ''
			// Non-streaming error path: the route returned a plain JSON error
			// (auth, validation, rate-limit, unknown problem).
			if (!contentType.includes('x-ndjson')) {
				const body = (await res.json().catch(() => null)) as {
					ok: boolean
					reason?: string
					message?: string
				} | null
				const message = body?.message ?? 'The tutor returned an unexpected response.'
				const retryable = body?.reason !== 'invalid'
				failWith(userMessageText, message, retryable)
				setPending(false)
				inFlightRef.current = false
				controllerRef.current = null
				return
			}

			const reader = res.body?.getReader()
			if (reader == null) {
				failWith(userMessageText, 'The tutor response had no body. Try again.', true)
				setPending(false)
				inFlightRef.current = false
				controllerRef.current = null
				return
			}

			const { aggregated, terminal, readError } = await readNdjsonStream(reader, {
				onStart: () => {
					if (!controller.signal.aborted) setStatus({ kind: 'streaming' })
				},
				onDelta: (text) => {
					deltaBufferRef.current += text
					scheduleFlush()
				}
			})

			// Drain any pending rAF so the final streamingReply matches the
			// aggregated text before we clear it.
			flush()

			if (controller.signal.aborted) {
				// User pressed Stop. Preserve the question for retry; do not
				// commit a partial response as authoritative history.
				rollbackAsCancelled()
				setPending(false)
				inFlightRef.current = false
				controllerRef.current = null
				return
			}
			if (readError) {
				failWith(userMessageText, 'The tutor stream dropped. Try again.', true)
				setPending(false)
				inFlightRef.current = false
				controllerRef.current = null
				return
			}
			if (terminal == null || terminal.type === 'aborted') {
				// Connection closed without a terminal event — treat like
				// network. Do not consume a question.
				rollbackAsCancelled()
				setPending(false)
				inFlightRef.current = false
				controllerRef.current = null
				return
			}
			if (terminal.type === 'error') {
				failWith(userMessageText, terminal.message, terminal.reason !== 'invalid')
				setPending(false)
				inFlightRef.current = false
				controllerRef.current = null
				return
			}

			// Success: commit the finished assistant message.
			if (aggregated.trim().length === 0) {
				failWith(
					userMessageText,
					'Tracy returned an empty response. Try rewording your question.',
					true
				)
				setPending(false)
				inFlightRef.current = false
				controllerRef.current = null
				return
			}

			const assistantMessage: TutorMessage = {
				id: generateId(),
				role: 'assistant',
				text: aggregated,
				createdAt: new Date().toISOString()
			}
			const committed: StoredConversation = {
				...baseConversation,
				messages: [...pendingTranscript, assistantMessage],
				questionsUsed: baseConversation.questionsUsed + 1,
				updatedAt: new Date().toISOString()
			}
			persist(committed)
			setStatus({ kind: 'idle' })
			setStreamingReply(null)
			setLastFailedText(null)
			deltaBufferRef.current = ''
			setPending(false)
			inFlightRef.current = false
			controllerRef.current = null
		},
		[persist, problemSlug, userId, flush, scheduleFlush]
	)

	const limitReached = conversation.questionsUsed >= MAX_QUESTIONS_PER_CONVERSATION
	const canSend =
		available &&
		!limitReached &&
		!pending &&
		status.kind !== 'sending' &&
		status.kind !== 'streaming'
	const canStop = status.kind === 'sending' || status.kind === 'streaming'

	const send = useCallback(
		(text: string) => {
			const trimmed = text.trim()
			if (trimmed.length === 0) return
			if (!canSend) return
			if (inFlightRef.current) return
			void runRequest(trimmed, conversation)
		},
		[canSend, runRequest, conversation]
	)

	const stop = useCallback(() => {
		controllerRef.current?.abort()
	}, [])

	const retry = useCallback(() => {
		if (lastFailedText == null || !available || pending) return
		if (inFlightRef.current) return
		void runRequest(lastFailedText, conversation)
	}, [available, pending, runRequest, conversation, lastFailedText])

	const startNew = useCallback(() => {
		if (userId == null) return
		controllerRef.current?.abort()
		controllerRef.current = null
		inFlightRef.current = false
		deltaBufferRef.current = ''
		clearConversation(userId, problemSlug)
		setConversation(newConversation())
		setStatus({ kind: 'idle' })
		setLastFailedText(null)
		setPending(false)
		setStreamingReply(null)
	}, [userId, problemSlug])

	return {
		messages: conversation.messages,
		streamingReply,
		questionsUsed: conversation.questionsUsed,
		questionsRemaining: Math.max(0, MAX_QUESTIONS_PER_CONVERSATION - conversation.questionsUsed),
		status,
		limitReached,
		canSend,
		canStop,
		send,
		stop,
		retry,
		startNew,
		available
	}
}
