// Which practice problems a signed-out visitor may open. Everything else needs
// an account; the check is enforced on the server (practice page), and the
// catalog reads the same list to show its locked state.
const GUEST_PRACTICE_SLUGS: readonly string[] = ['two-sum']

export function isGuestPracticeSlug(slug: string): boolean {
	return GUEST_PRACTICE_SLUGS.includes(slug)
}

export function practiceAccess(slug: string, authenticated: boolean): 'open' | 'sign-in' {
	return authenticated || isGuestPracticeSlug(slug) ? 'open' : 'sign-in'
}
