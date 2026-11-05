import { problemForDate } from '../problems/daily-problem'
import { isIsoDate } from './week'

// Which problem is a date's challenge (specs/features/daily-challenge.md § Assignment).
//
// The mapping starts as the same deterministic hash the Problems calendar has always
// used, but is PINNED the first time a date is needed: from then on the stored row is
// the only source, so adding or removing a problem later never changes an assignment
// that has been made. A date in the future is never resolved at all, so it can neither
// be opened nor previewed.

export interface PinnedChallenge {
	challengeDate: string
	problemSlug: string
}

export interface ChallengeCatalogStore {
	find(date: string): Promise<PinnedChallenge | null>
	// Insert if absent (a unique key decides); an existing row is never overwritten.
	pin(date: string, problemSlug: string): Promise<void>
}

// The first date that has a challenge: the product's launch. No earlier date can be opened
// or pinned, so a request for an arbitrary past date cannot create rows (one per date) or
// invent a history that never existed.
export const CHALLENGE_EPOCH = '2026-10-30'

export type ChallengeLookup =
	| { status: 'ok'; date: string; problemSlug: string; kind: 'live' | 'past' }
	| { status: 'invalid' }
	| { status: 'before_launch' }
	| { status: 'locked' }
	| { status: 'unavailable' }

export function pickProblem(eligibleSlugs: readonly string[], date: string): string | undefined {
	return problemForDate(eligibleSlugs, date)
}

export async function resolveChallenge(
	store: ChallengeCatalogStore,
	rawDate: string,
	today: string,
	eligibleSlugs: readonly string[]
): Promise<ChallengeLookup> {
	if (!isIsoDate(rawDate)) return { status: 'invalid' }
	// Before launch there is no challenge; after today there is none yet. Neither reads,
	// creates or reveals anything.
	if (rawDate < CHALLENGE_EPOCH) return { status: 'before_launch' }
	if (rawDate > today) return { status: 'locked' }
	const kind = rawDate === today ? 'live' : 'past'

	const existing = await store.find(rawDate)
	if (existing != null)
		return { status: 'ok', date: rawDate, problemSlug: existing.problemSlug, kind }

	const pick = pickProblem(eligibleSlugs, rawDate)
	if (pick == null) return { status: 'unavailable' }
	await store.pin(rawDate, pick)
	// Re-read: if two requests raced, the row that won is the assignment for both.
	const pinned = await store.find(rawDate)
	return pinned == null
		? { status: 'unavailable' }
		: { status: 'ok', date: rawDate, problemSlug: pinned.problemSlug, kind }
}
