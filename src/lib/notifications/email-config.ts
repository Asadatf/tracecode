// Whether reminder email may be sent at all, decided from configuration alone —
// no network call (M7.5B). Pure, so the "no unapproved external send" guarantee
// is unit-tested rather than assumed.
//
// Sending requires ALL of:
//   - RESEND_API_KEY;
//   - REMINDER_FROM_EMAIL, a plain address;
//   - RESEND_VERIFIED_DOMAIN, the domain the operator has verified in Resend,
//     which the sender's domain must equal exactly.
// The last two are a deliberate operator declaration: an API key on its own
// (e.g. one sitting in a developer's .env.local) never causes a send.

export type EmailConfig =
	| { enabled: true; apiKey: string; from: string }
	| { enabled: false; reason: 'no_api_key' | 'no_sender' | 'invalid_sender' | 'unverified_domain' }

export interface EmailEnv {
	RESEND_API_KEY?: string
	REMINDER_FROM_EMAIL?: string
	RESEND_VERIFIED_DOMAIN?: string
}

// Deliberately narrow: local@domain, no display name, no whitespace.
const ADDRESS = /^[^\s@<>"]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i

export function resolveEmailConfig(env: EmailEnv): EmailConfig {
	const apiKey = env.RESEND_API_KEY?.trim() ?? ''
	if (apiKey === '') return { enabled: false, reason: 'no_api_key' }
	const from = env.REMINDER_FROM_EMAIL?.trim() ?? ''
	if (from === '') return { enabled: false, reason: 'no_sender' }
	const match = ADDRESS.exec(from)
	const senderDomain = match?.[1]?.toLowerCase()
	if (senderDomain == null) return { enabled: false, reason: 'invalid_sender' }
	const verified = env.RESEND_VERIFIED_DOMAIN?.trim().toLowerCase() ?? ''
	if (verified === '' || senderDomain !== verified) {
		return { enabled: false, reason: 'unverified_domain' }
	}
	return { enabled: true, apiKey, from }
}
