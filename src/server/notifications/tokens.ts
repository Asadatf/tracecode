import { randomBytes } from 'node:crypto'

// A fresh unsubscribe token: 256 bits from the OS CSPRNG, base64url (43 chars).
// Unguessable, so it can authorise its one action — turning email off — without
// a session. Matches isWellFormedUnsubscribeToken.
export function newUnsubscribeToken(): string {
	return randomBytes(32).toString('base64url')
}
