// sessionStorage-backed conversation store. Everything here runs in the
// browser; nothing is persisted server-side (specs/features/
// contextual-ai-tutor.md § Storage). The store is namespaced by
// (user, problem) so switching problems or signing in as another user
// never mixes transcripts.
//
// This file is deliberately framework-free: it is unit-testable under
// `node --test` with a shimmed sessionStorage (see conversation-store.test.mts).

import type { TutorMessage } from './types'

const KEY_PREFIX = 'tracecode.tutor.'
const CURRENT_VERSION = 1

export interface StoredConversation {
	v: number
	conversationId: string
	messages: TutorMessage[]
	// Number of SUCCESSFUL learner questions (i.e. questions that resulted
	// in an assistant reply). Failures do not count toward the 15-question
	// cap — see MAX_QUESTIONS_PER_CONVERSATION.
	questionsUsed: number
	createdAt: string
	updatedAt: string
}

export interface StorageLike {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
	removeItem(key: string): void
	readonly length: number
	key(index: number): string | null
}

export function conversationKey(userId: string, problemSlug: string): string {
	return `${KEY_PREFIX}${userId}.${problemSlug}`
}

function safeStorage(): StorageLike | null {
	// SSR renders the page before sessionStorage exists; a private tab may
	// also throw on access. Either way we behave as "no persisted state" and
	// let the caller start a fresh conversation.
	if (typeof window === 'undefined') return null
	try {
		return window.sessionStorage
	} catch {
		return null
	}
}

export function loadConversation(
	userId: string,
	problemSlug: string,
	storage: StorageLike | null = safeStorage()
): StoredConversation | null {
	if (storage == null) return null
	try {
		const raw = storage.getItem(conversationKey(userId, problemSlug))
		if (raw == null) return null
		const parsed = JSON.parse(raw) as unknown
		if (!isStoredConversation(parsed)) {
			storage.removeItem(conversationKey(userId, problemSlug))
			return null
		}
		return parsed
	} catch {
		return null
	}
}

export function saveConversation(
	userId: string,
	problemSlug: string,
	conversation: StoredConversation,
	storage: StorageLike | null = safeStorage()
): boolean {
	if (storage == null) return false
	try {
		storage.setItem(conversationKey(userId, problemSlug), JSON.stringify(conversation))
		return true
	} catch {
		// Quota exceeded, or a locked-down browser. Returning false lets the
		// hook render a non-blocking warning instead of crashing Practice.
		return false
	}
}

export function clearConversation(
	userId: string,
	problemSlug: string,
	storage: StorageLike | null = safeStorage()
): void {
	if (storage == null) return
	try {
		storage.removeItem(conversationKey(userId, problemSlug))
	} catch {
		// Nothing we can do; the write would have failed too.
	}
}

// Logout clean-up. Removes every tutor entry regardless of user — the tab
// could have a prior user's transcripts. Only keys with our prefix are
// touched; other sessionStorage entries are left alone (AGENTS.md:
// "Do not globally clear unrelated browser storage").
export function clearAllTutorConversations(storage: StorageLike | null = safeStorage()): number {
	if (storage == null) return 0
	const toDelete: string[] = []
	try {
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i)
			if (key != null && key.startsWith(KEY_PREFIX)) toDelete.push(key)
		}
		for (const key of toDelete) storage.removeItem(key)
	} catch {
		// Carry on; partial clear is better than none.
	}
	return toDelete.length
}

export function newConversation(): StoredConversation {
	const now = new Date().toISOString()
	return {
		v: CURRENT_VERSION,
		conversationId: generateId(),
		messages: [],
		questionsUsed: 0,
		createdAt: now,
		updatedAt: now
	}
}

export function generateId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID()
	}
	return `c_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

function isStoredConversation(value: unknown): value is StoredConversation {
	if (typeof value !== 'object' || value === null) return false
	const v = value as Partial<StoredConversation>
	return (
		v.v === CURRENT_VERSION &&
		typeof v.conversationId === 'string' &&
		Array.isArray(v.messages) &&
		typeof v.questionsUsed === 'number' &&
		typeof v.createdAt === 'string' &&
		typeof v.updatedAt === 'string' &&
		v.messages.every(
			(m): m is TutorMessage =>
				typeof m === 'object' &&
				m !== null &&
				typeof (m as TutorMessage).id === 'string' &&
				((m as TutorMessage).role === 'user' || (m as TutorMessage).role === 'assistant') &&
				typeof (m as TutorMessage).text === 'string'
		)
	)
}

export const __internal = { KEY_PREFIX, CURRENT_VERSION, isStoredConversation }
