import { normalizeUsername } from './username'
import type { ProfileChange } from './profile-settings'

// Query builders for the profile settings. Each takes the id (or username) it needs
// and puts it in the WHERE; the owner's id comes from the session and from nowhere
// else. They are pure so what is selected and filtered can be asserted.

const OWNER_SELECT = { username: true, profileVisibility: true } as const

// The owner's own settings. Never selects email, id or anything else.
export function ownerSettingsQuery(userId: string) {
	return { where: { id: userId }, select: OWNER_SELECT }
}

export function updateProfileQuery(userId: string, change: ProfileChange) {
	return { where: { id: userId }, data: change, select: OWNER_SELECT }
}

// The ONLY way a stranger reaches a profile: by username, and only while its owner
// has explicitly made it PUBLIC. A private profile, an unset one and a username
// nobody has are indistinguishable from the outside (same empty result). It selects
// the minimum a profile page needs to go and load that learner's public data: the
// id stays on the server and the username is echoed back normalised. It never
// selects email, source code, tutor conversations or analytics.
export function publicProfileLookupQuery(rawUsername: string) {
	return {
		where: { username: normalizeUsername(rawUsername), profileVisibility: 'PUBLIC' as const },
		select: { id: true, username: true }
	}
}
