import { z } from 'zod'
import { safeReturnTo } from './return-to'

// Google and GitHub sign-in through Supabase Auth (specs/features/oauth-sign-in.md).
// Pure helpers shared by the start action, the callback route and the forms.

export const OAUTH_PROVIDERS = ['google', 'github'] as const
export const oauthProviderSchema = z.enum(OAUTH_PROVIDERS)
export type OAuthProvider = z.infer<typeof oauthProviderSchema>

export const OAUTH_CALLBACK_PATH = '/api/auth/callback'

export const PROVIDER_NAME: Record<OAuthProvider, string> = {
	google: 'Google',
	github: 'GitHub'
}

// Which providers show a button (AC1, AC2): each is switched on by its own
// server-only flag, because it only works once the provider is set up in
// Supabase.
export function enabledProviders(flags: {
	AUTH_GOOGLE_ENABLED?: string
	AUTH_GITHUB_ENABLED?: string
}): OAuthProvider[] {
	return OAUTH_PROVIDERS.filter((provider) =>
		provider === 'google'
			? flags.AUTH_GOOGLE_ENABLED === 'true'
			: flags.AUTH_GITHUB_ENABLED === 'true'
	)
}

// Where the provider sends the learner back to: our callback, carrying the
// sanitised destination and the provider (for the error message).
export function oauthRedirectTo(
	appUrl: string,
	provider: OAuthProvider,
	next: string | null
): string {
	const url = new URL(OAUTH_CALLBACK_PATH, appUrl)
	url.searchParams.set('next', safeReturnTo(next))
	url.searchParams.set('provider', provider)
	return url.toString()
}

// `/login?oauth_error=<provider>`, shown as the AC4 message.
export function oauthFailurePath(provider: string | null): string {
	const parsed = oauthProviderSchema.safeParse(provider)
	return parsed.success ? `/login?oauth_error=${parsed.data}` : '/login?oauth_error=unknown'
}

export function oauthFailureMessage(provider: string | null): string {
	const parsed = oauthProviderSchema.safeParse(provider)
	const name = parsed.success ? PROVIDER_NAME[parsed.data] : 'that provider'
	return `Sign-in with ${name} was cancelled or failed. Try again or use email.`
}
