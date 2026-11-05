import 'server-only'
import { db } from '@/server/db/client'
import { reportProfileFailure } from './report'
import { currentLearnerId, currentUserIdSafe } from '@/server/auth/session'
import {
	ownerSettingsQuery,
	publicProfileLookupQuery,
	updateProfileQuery
} from '@/lib/profile/profile-queries'
import {
	updateProfile,
	type ProfileStore,
	type ProfileUpdateResult
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
	} catch (error) {
		// Still "unavailable" for the learner, but never silent: a stale Prisma client
		// or a missing column must be visible to whoever runs the server.
		reportProfileFailure('profile-settings', error)
		return { authenticated: true, available: false }
	}
}

export async function updateProfileSettings(
	input: ProfileSettingsInput
): Promise<ProfileUpdateResult> {
	return updateProfile(await currentLearnerId(), store, input)
}
