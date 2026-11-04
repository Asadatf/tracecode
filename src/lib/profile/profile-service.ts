import { checkUsername } from './username'
import {
	isUsernameTakenError,
	planProfileUpdate,
	type ProfileSettings,
	type ProfileSettingsInput,
	type ProfileUpdateError,
	type Visibility
} from './profile-settings'

// The profile rules as orchestration over an injected store, so every decision —
// who may write, what is rejected, who can be found — is unit tested with an
// in-memory fake that behaves like the database (including its unique index). The
// Prisma wiring is in src/server/profile/profile.ts.

export interface OwnerRow {
	username: string | null
	profileVisibility: Visibility
}

export interface ProfileStore {
	findOwner(userId: string): Promise<OwnerRow | null>
	// May throw a unique-constraint error (P2002) on the username column.
	update(
		userId: string,
		change: { username?: string; profileVisibility?: Visibility }
	): Promise<OwnerRow>
	findPublic(username: string): Promise<{ id: string; username: string | null } | null>
}

export type ProfileUpdateResult =
	({ saved: true } & ProfileSettings) | { saved: false; error: ProfileUpdateError }

// `userId` is the validated session's learner (null when signed out) — it is a
// parameter of the wiring, never of the request, so only the owner can change their
// own settings. Signed out: nothing is read or written.
export async function updateProfile(
	userId: string | null,
	store: ProfileStore,
	input: ProfileSettingsInput
): Promise<ProfileUpdateResult> {
	if (userId == null) return { saved: false, error: 'unauthenticated' }

	const row = await store.findOwner(userId)
	const current: ProfileSettings = {
		username: row?.username ?? null,
		visibility: row?.profileVisibility ?? 'PRIVATE'
	}
	const plan = planProfileUpdate(current, input)
	if (!plan.ok) return { saved: false, error: plan.error }
	if (Object.keys(plan.change).length === 0) return { saved: true, ...current }

	try {
		const updated = await store.update(userId, plan.change)
		return { saved: true, username: updated.username, visibility: updated.profileVisibility }
	} catch (error) {
		// The unique index decides, so two simultaneous claims cannot both win.
		if (isUsernameTakenError(error)) return { saved: false, error: 'taken' }
		throw error
	}
}

// What a profile page needs to find a public profile's owner. SERVER ONLY: `userId`
// must never reach a client component or a response (see toPublicProfileView).
export interface PublicProfileOwner {
	userId: string
	username: string
}

// Null for a malformed, unknown, unset OR private username alike, so it cannot be
// used to discover which private accounts exist.
export async function lookupPublicProfile(
	store: ProfileStore,
	rawUsername: string
): Promise<PublicProfileOwner | null> {
	const checked = checkUsername(rawUsername)
	if (!checked.ok) return null
	const row = await store.findPublic(checked.username)
	return row?.username == null ? null : { userId: row.id, username: row.username }
}

// The only thing about a public profile that is safe to send to a browser so far.
export function toPublicProfileView(owner: PublicProfileOwner): { username: string } {
	return { username: owner.username }
}
