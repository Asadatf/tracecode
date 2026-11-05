'use server'

import { validatedAction } from './validated-action'
import { profileSettingsInput } from '@/lib/profile/profile-settings'
import { updateProfileSettings } from '@/server/profile/profile'

// Server Action for the Settings "Public profile" form (M9A.3). A thin shell: it
// takes no user id — the owner comes from the session inside updateProfileSettings —
// and its strict input rejects any key but `username` and `visibility`.
export const updateProfileSettingsAction = validatedAction({
	input: profileSettingsInput,
	handler: async (input) => updateProfileSettings(input)
})
