import type { AdminRole } from '@prisma/client'
import { LOWEST_ROLE } from './roles'

// Auto-provisioning rule: an email on one of your own domains gets a DEFAULT
// admin seat; every other domain gets no seat at all. The domains come from
// ADMIN_EMAIL_DOMAINS (comma-separated, e.g. "acme.com,acme.dev"). Unset or
// empty means nobody is auto-seated and every seat is granted by hand. The seat
// is deliberately the LOWEST role, to be elevated on purpose: no email string
// is ever a path to elevated access.
function staffDomains(raw: string | undefined): Set<string> {
	return new Set(
		(raw ?? '')
			.split(',')
			.map((domain) => domain.trim().toLowerCase())
			.filter(Boolean)
	)
}

// The admin role a newly provisioned user should get from their email, or null
// for "no admin seat" (the normal case for end users). Called by provisionUser
// on first sign-in. Case-insensitive on the domain; a malformed address returns
// null rather than throwing. `domains` defaults to ADMIN_EMAIL_DOMAINS and is
// only passed by tests.
export function seatRoleForEmail(
	email: string,
	domains: string | undefined = process.env.ADMIN_EMAIL_DOMAINS
): AdminRole | null {
	if (!email.includes('@')) return null
	const domain = email.split('@').at(-1)?.toLowerCase() ?? ''
	return staffDomains(domains).has(domain) ? LOWEST_ROLE : null
}
