import { z } from 'zod'

// The learner's unsaved editor code, kept per problem in the browser
// (specs/features/editor-drafts.md). Pure helpers over a Storage-like object so
// they unit-test without a browser; every storage call is guarded because
// localStorage can throw (private mode, blocked site data, a full quota).

export const DRAFT_DEBOUNCE_MS = 500
// The largest real solution is a few hundred characters; anything bigger is
// pasted junk, not worth filling the quota with.
export const MAX_DRAFT_CHARS = 100_000

const KEY_PREFIX = 'tracecode:draft:v1:'

const draftSchema = z.object({ code: z.string(), savedAt: z.string() })
export type Draft = z.infer<typeof draftSchema>

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function draftKey(slug: string): string {
	return `${KEY_PREFIX}${slug}`
}

// The saved draft for a problem, or null. A value that is not valid JSON or
// not a draft is removed so it never comes back.
export function readDraft(storage: DraftStorage | null, slug: string): Draft | null {
	if (storage == null) return null
	try {
		const raw = storage.getItem(draftKey(slug))
		if (raw == null) return null
		const parsed = draftSchema.safeParse(parseJson(raw))
		if (parsed.success) return parsed.data
		storage.removeItem(draftKey(slug))
		return null
	} catch {
		return null
	}
}

// Saves the code as the problem's draft. Code equal to the starter is not a
// draft (AC5), so it clears any stored one instead. Never throws.
export function writeDraft(
	storage: DraftStorage | null,
	slug: string,
	code: string,
	starter: string,
	now: Date = new Date()
): void {
	if (storage == null) return
	try {
		if (code === starter) {
			storage.removeItem(draftKey(slug))
			return
		}
		if (code.length > MAX_DRAFT_CHARS) return
		const draft: Draft = { code, savedAt: now.toISOString() }
		storage.setItem(draftKey(slug), JSON.stringify(draft))
	} catch {
		// Quota full or storage blocked: the editor keeps working unsaved (AC6).
	}
}

export function clearDraft(storage: DraftStorage | null, slug: string): void {
	if (storage == null) return
	try {
		storage.removeItem(draftKey(slug))
	} catch {
		// Storage blocked: nothing was saved to clear.
	}
}

// The browser's localStorage, or null where reading it throws.
export function browserStorage(): DraftStorage | null {
	try {
		return typeof window === 'undefined' ? null : window.localStorage
	} catch {
		return null
	}
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw)
	} catch {
		return null
	}
}
