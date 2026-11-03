'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { env } from '@/lib/env'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture-error'
import {
	enabledProviders,
	oauthFailurePath,
	oauthProviderSchema,
	oauthRedirectTo
} from '@/lib/auth/oauth'

// Start Google or GitHub sign-in (specs/features/oauth-sign-in.md, AC3). A form
// action rather than a client call, so the PKCE code verifier is set as a
// cookie by the server Supabase client. Identity is only ever taken from
// Supabase's verified response in the callback, never from this form.
const startInput = z.object({
	provider: oauthProviderSchema,
	next: z.string().nullable()
})

export async function startOAuthAction(formData: FormData): Promise<void> {
	const parsed = startInput.safeParse({
		provider: formData.get('provider'),
		next: formData.get('next')
	})
	if (!parsed.success || !enabledProviders(env).includes(parsed.data.provider)) {
		redirect(oauthFailurePath(parsed.success ? parsed.data.provider : null))
	}
	const { provider, next } = parsed.data

	let url: string | null = null
	try {
		const supabase = await createServerSupabaseClient()
		const { data, error } = await supabase.auth.signInWithOAuth({
			provider,
			options: {
				redirectTo: oauthRedirectTo(env.NEXT_PUBLIC_APP_URL, provider, next),
				// GitHub hides private emails unless asked; a user row needs one.
				scopes: provider === 'github' ? 'user:email' : undefined
			}
		})
		if (error != null) throw error
		url = data.url
	} catch (error) {
		captureError(error)
	}
	// redirect() throws, so it stays outside the try/catch above.
	redirect(url ?? oauthFailurePath(provider))
}
