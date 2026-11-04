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
import { settleExchange, isLimitReached } from '@/lib/tutor/conversation-flow'
import { runExchange } from '@/lib/tutor/exchange'
import {
	MAX_QUESTIONS_PER_CONVERSATION,
	type TutorContext,
	type TutorMessage,
	type TutorRequest
} from '@/lib/tutor/types'

// Client-side state for one (user, problem) conversation. The protocol and the
// decision about what an exchange's outcome was live in src/lib/tutor/exchange.ts
// (pure, unit tested); this hook turns that outcome into state and storage.
//
// Rules it enforces:
//   - The learner's question is shown at once but is only committed, and only
//     counted toward the 15, when a reply FINISHES (`done`). A failed, cut-off,
//     stopped or stale exchange rolls the question back and keeps its text so
//     it can be retried without retyping.
//   - A partial reply is shown only as a temporary message and is never saved.
//   - One request at a time (a synchronous guard, since state is async).
//   - Each request is tied to the conversation it started in. If the learner
//     switches problem or starts a new chat, that request is aborted and its
//     response is ignored, so it can never update another conversation.
//   - Nothing here calls a model directly; the API key stays on the server.

export interface UseTutorArgs {
	userId: string | null
	problemSlug: string
	buildContext: () => TutorContext
}

export type TutorUiStatus =
	| { kind: 'idle' }
	| { kind: 'sending' } // waiting for the first byte
	| { kind: 'streaming' } // receiving the reply
	| { kind: 'stopped' } // the learner pressed Stop; the question was not counted
	| { kind: 'error'; message: string; retryable: boolean }

export interface UseTutor {
	messages: TutorMessage[]
	// The in-flight reply, shown as a temporary message. Never persisted.
	streamingReply: string | null
	questionsUsed: number
	questionsRemaining: number
	status: TutorUiStatus
	limitReached: boolean
	canSend: boolean
	canStop: boolean
	// The question that did not complete (failed, cut off or stopped), ready to
	// resend without retyping. Null when there is nothing to retry.
	retryText: string | null
	send: (text: string) => void
	stop: () => void
	retry: () => void
	startNew: () => void
	available: boolean
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
	const [retryText, setRetryText] = useState<string | null>(null)

	const buildContextRef = useRef<() => TutorContext>(buildContext)
	useEffect(() => {
		buildContextRef.current = buildContext
	}, [buildContext])

	// The live request's controller. It doubles as the request's identity: a
	// request is current only while this ref still points at its own controller.
	const controllerRef = useRef<AbortController | null>(null)
	const inFlightRef = useRef(false)
	// Deltas are batched and flushed once per animation frame, so the reply
	// renders smoothly instead of re-rendering per token.
	const deltaBufferRef = useRef('')
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

	// Switching to another (user, problem) loads that conversation's state. State
	// is reset while rendering, which is React's pattern for "a prop changed".
	const namespaceKey = userId == null ? `_anon_:${problemSlug}` : `${userId}:${problemSlug}`
	const [prevKey, setPrevKey] = useState(namespaceKey)
	if (prevKey !== namespaceKey) {
		setPrevKey(namespaceKey)
		setConversation(
			userId != null
				? (loadConversation(userId, problemSlug) ?? newConversation())
				: newConversation()
		)
		setStatus({ kind: 'idle' })
		setPending(false)
		setStreamingReply(null)
		setRetryText(null)
	}

	// Leaving a conversation (switching problem, unmounting) aborts its request and
	// drops its identity, so a late response is recognised as stale and ignored.
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
		async (questionText: string, base: StoredConversation) => {
			if (userId == null) return
			const controller = new AbortController()
			controllerRef.current = controller
			inFlightRef.current = true
			setPending(true)
			setStatus({ kind: 'sending' })
			setStreamingReply('')
			setRetryText(null)
			deltaBufferRef.current = ''

			const userMessage: TutorMessage = {
				id: generateId(),
				role: 'user',
				text: questionText,
				createdAt: new Date().toISOString()
			}
			const withQuestion = [...base.messages, userMessage]
			// Show the question immediately. It is not counted, and a stopped or
			// failed exchange below puts the transcript back to `base`.
			persist({ ...base, messages: withQuestion, updatedAt: new Date().toISOString() })

			let context: TutorContext = {}
			const build = buildContextRef.current
			try {
				context = build()
			} catch {
				context = {}
			}
			const payload: TutorRequest = {
				problemSlug,
				conversationId: base.conversationId,
				messages: withQuestion.map((m) => ({ id: m.id, role: m.role, text: m.text })),
				context
			}

			const outcome = await runExchange({
				payload,
				signal: controller.signal,
				isStale: () => controllerRef.current !== controller,
				onStart: () => setStatus({ kind: 'streaming' }),
				onDelta: (text) => {
					deltaBufferRef.current += text
					scheduleFlush()
				}
			})

			const reply: TutorMessage | null =
				outcome.kind === 'done'
					? {
							id: generateId(),
							role: 'assistant',
							text: outcome.text,
							createdAt: new Date().toISOString()
						}
					: null
			const settled = settleExchange({ base, question: userMessage, reply, outcome })

			// The learner left this conversation: touch nothing.
			if (settled.kind === 'ignore') return

			deltaBufferRef.current = ''
			controllerRef.current = null
			inFlightRef.current = false
			setPending(false)
			setStreamingReply(null)

			if (settled.kind === 'commit') {
				persist(settled.conversation)
				setStatus({ kind: 'idle' })
				return
			}

			// Stopped or failed: nothing is committed and no question is used.
			persist(settled.conversation)
			setRetryText(settled.retryText)
			if (settled.reason === 'cancelled') {
				setStatus({ kind: 'stopped' })
			} else {
				setStatus({
					kind: 'error',
					message: settled.message ?? 'Something went wrong. Try again.',
					retryable: settled.retryable
				})
			}
		},
		[persist, problemSlug, userId, scheduleFlush]
	)

	const limitReached = isLimitReached(conversation)
	const busy = pending || status.kind === 'sending' || status.kind === 'streaming'
	const canSend = available && !limitReached && !busy
	const canStop = status.kind === 'sending' || status.kind === 'streaming'

	const send = useCallback(
		(text: string) => {
			const trimmed = text.trim()
			if (trimmed.length === 0 || !canSend || inFlightRef.current) return
			void runRequest(trimmed, conversation)
		},
		[canSend, runRequest, conversation]
	)

	const stop = useCallback(() => {
		controllerRef.current?.abort()
	}, [])

	const retry = useCallback(() => {
		if (retryText == null || !canSend || inFlightRef.current) return
		void runRequest(retryText, conversation)
	}, [retryText, canSend, runRequest, conversation])

	const startNew = useCallback(() => {
		if (userId == null) return
		// Dropping the controller makes any request still in flight stale.
		controllerRef.current?.abort()
		controllerRef.current = null
		inFlightRef.current = false
		deltaBufferRef.current = ''
		clearConversation(userId, problemSlug)
		setConversation(newConversation())
		setStatus({ kind: 'idle' })
		setRetryText(null)
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
		retryText,
		send,
		stop,
		retry,
		startNew,
		available
	}
}
