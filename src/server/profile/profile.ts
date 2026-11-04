import 'server-only'
import { db } from '@/server/db/client'
import { currentLearnerId, currentUserIdSafe } from '@/server/auth/session'
import {
	ownerSettingsQuery,
	publicProfileLookupQuery,
	updateProfileQuery
} from '@/lib/profile/profile-queries'
import {
	lookupPublicProfile,
	updateProfile,
	type ProfileStore,
	type ProfileUpdateResult,
	type PublicProfileOwner
} from '@/lib/profile/profile-service'
import type { ProfileSettings, ProfileSettingsInput } from '@/lib/profile/profile-settings'

// Public developer-profile settings (specs/features/public-profile-settings.md).
// The decisions live in src/lib/profile/profile-service.ts; this is the Prisma
// wiring. Every owner function resolves the learner from the validated session —
// never from its arguments — so only the account owner can read or change their own
// settings.

const store: ProfileStore = {
	findOwner: (userId) => db.user.findUnique(ownerSettingsQuery(userId)),
	update: (userId, change) => db.user.update(updateProfileQuery(userId, change)),
	findPublic: (username) => db.user.findFirst(publicProfileLookupQuery(username))
}

export type ProfileSettingsView =
	| { authenticated: false }
	| { authenticated: true; available: false }
	| ({ authenticated: true; available: true } & ProfileSettings)

// For the Settings page. Signed out, or the columns/database unavailable (for
// example the migration has not run yet): no values, so nothing is invented.
export async function getProfileSettings(): Promise<ProfileSettingsView> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { authenticated: false }
	try {
		const row = await store.findOwner(userId)
		return {
			authenticated: true,
			available: true,
			username: row?.username ?? null,
			visibility: row?.profileVisibility ?? 'PRIVATE'
		}
	} catch {
		return { authenticated: true, available: false }
	}
}

export async function updateProfileSettings(
	input: ProfileSettingsInput
): Promise<ProfileUpdateResult> {
	return updateProfile(await currentLearnerId(), store, input)
}

// The narrow lookup M9A.4 will use for a public profile page. A lookup failure is
// "not found", never an error page that would reveal anything.
export async function findPublicProfile(rawUsername: string): Promise<PublicProfileOwner | null> {
	try {
		return await lookupPublicProfile(store, rawUsername)
	} catch {
		return null
	}
}

export { toPublicProfileView } from '@/lib/profile/profile-service'
export type { PublicProfileOwner } from '@/lib/profile/profile-service'
