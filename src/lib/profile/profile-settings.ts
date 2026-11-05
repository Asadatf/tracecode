import { z } from 'zod'
import { checkUsername, type UsernameError } from './username'

// The owner's public-profile settings and how a change to them is decided
// (specs/features/public-profile-settings.md). Pure: no I/O, no clock, so every rule
// is unit tested. The server runs `planProfileUpdate` on the CURRENT stored values
// and writes only what it returns; nothing the browser sends is trusted beyond the
// two fields below, and the input has no user id at all (the owner is the session).

export const VISIBILITIES = ['PRIVATE', 'PUBLIC'] as const
export type Visibility = (typeof VISIBILITIES)[number]

export interface ProfileSettings {
	// Null until the owner picks one.
	username: string | null
	visibility: Visibility
}

// Strict: an unknown key — `userId`, `email`, anything — is rejected, not ignored.
export const profileSettingsInput = z
	.object({
		username: z.string().max(200).optional(),
		visibility: z.enum(VISIBILITIES).optional()
	})
	.strict()
export type ProfileSettingsInput = z.infer<typeof profileSettingsInput>

export type ProfileUpdateError = UsernameError | 'username_required' | 'taken' | 'unauthenticated'

// The columns to change. Empty means nothing differs from what is stored.
export interface ProfileChange {
	username?: string
	profileVisibility?: Visibility
}

export type ProfilePlan =
	{ ok: true; change: ProfileChange } | { ok: false; error: ProfileUpdateError }

export function planProfileUpdate(
	current: ProfileSettings,
	input: ProfileSettingsInput
): ProfilePlan {
	const change: ProfileChange = {}
	let username = current.username

	if (input.username !== undefined) {
		const checked = checkUsername(input.username)
		if (!checked.ok) return { ok: false, error: checked.error }
		if (checked.username !== current.username) change.username = checked.username
		username = checked.username
	}

	// Changing a username never changes visibility: a private profile stays private
	// and a public one stays public. Only an explicit `visibility` does.
	if (input.visibility !== undefined) {
		// A public profile needs an address to be found at.
		if (input.visibility === 'PUBLIC' && username == null) {
			return { ok: false, error: 'username_required' }
		}
		if (input.visibility !== current.visibility) change.profileVisibility = input.visibility
	}
	return { ok: true, change }
}

// A unique-constraint violation on the username index (Prisma P2002), recognised by
// code and by the column it names, so another unique index failing is never
// misreported as "taken".
export function isUsernameTakenError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false
	const { code, meta } = error as { code?: unknown; meta?: unknown }
	if (code !== 'P2002') return false
	const target = (meta as { target?: unknown } | null | undefined)?.target
	return Array.isArray(target)
		? target.includes('username')
		: typeof target === 'string' && target.includes('username')
}
