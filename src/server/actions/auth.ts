'use server'

import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { provisionUser } from '@/server/auth/provision-user'
import { captureError } from '@/lib/observability/capture-error'
import {
	credentialsSchema,
	INVALID_CREDENTIALS_INPUT,
	userCausedAuthMessage
} from '@/lib/auth/credentials'
import { safeReturnTo } from '@/lib/auth/return-to'

// Email + password via Supabase Auth, nothing else (docs/rules/auth.md): the
// session cookie is set by the Supabase client, and the only application data
// written is the public.users row, through Prisma (provisionUser). The id and
// email provisioned come from Supabase's response, never from the form.

export interface AuthFormState {
	error?: string
	notice?: string
}

export async function authenticateAction(
	_previous: AuthFormState,
	formData: FormData
): Promise<AuthFormState> {
	const parsed = credentialsSchema.safeParse({
		mode: formData.get('mode'),
		email: formData.get('email'),
		password: formData.get('password')
	})
	if (!parsed.success) return { error: INVALID_CREDENTIALS_INPUT }
	const { mode, email, password } = parsed.data
	// Untrusted (it rides in a form field): only a same-origin path survives.
	const returnTo = safeReturnTo(formData.get('next')?.toString())

	try {
		const supabase = await createServerSupabaseClient()
		const { data, error } =
			mode === 'sign-up'
				? await supabase.auth.signUp({ email, password })
				: await supabase.auth.signInWithPassword({ email, password })

		if (error) {
			const message = userCausedAuthMessage(error.code)
			if (message != null) return { error: message }
			throw error
		}

		// Sign-up with email confirmation on returns a user but no session:
		// they sign in after confirming, and provisioning happens then.
		if (data.session == null || data.user == null || !data.user.email) {
			return { notice: 'Check your email to confirm your account, then sign in.' }
		}
		await provisionUser({ id: data.user.id, email: data.user.email })
	} catch (error) {
		return { error: captureError(error).userMessage }
	}

	// redirect() throws, so it stays outside the try/catch above; the return is
	// only for the type checker (next-intl's redirect isn't typed `never`).
	redirect({ href: returnTo, locale: await getLocale() })
	return {}
}

export async function signOutAction(): Promise<void> {
	try {
		const supabase = await createServerSupabaseClient()
		await supabase.auth.signOut()
	} catch (error) {
		captureError(error)
	}
	redirect({ href: '/login', locale: await getLocale() })
}
