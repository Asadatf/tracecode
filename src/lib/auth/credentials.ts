import { z } from 'zod'

// Bounds match Supabase's own defaults: a 6-character minimum server-side, and
// bcrypt ignores everything past 72 bytes, so a longer password adds nothing.
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 72

export const credentialsSchema = z.object({
	mode: z.enum(['sign-in', 'sign-up']),
	email: z.string().trim().toLowerCase().pipe(z.email()),
	password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)
})

export type Credentials = z.infer<typeof credentialsSchema>

export const INVALID_CREDENTIALS_INPUT = `Enter a valid email and a password of ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`

// Supabase auth error codes that are the user's doing, with a message written
// for them. Anything not listed is a real failure and goes to captureError
// (docs/rules/error-handling.md) — never show a raw auth error.
const USER_CAUSED_AUTH_ERRORS: Record<string, string> = {
	invalid_credentials: 'Incorrect email or password.',
	email_not_confirmed: 'Confirm your email first (check your inbox), then sign in.',
	user_already_exists: 'An account with this email already exists. Sign in instead.',
	weak_password: `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`,
	over_email_send_rate_limit:
		'Too many emails were sent just now. Wait a few minutes and try again.',
	over_request_rate_limit: 'Too many attempts. Wait a few minutes and try again.'
}

export function userCausedAuthMessage(code: string | undefined): string | null {
	if (code == null) return null
	return USER_CAUSED_AUTH_ERRORS[code] ?? null
}
