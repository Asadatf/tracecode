// What the landing header shows, as data, so signed-out and signed-in
// navigation can be asserted without rendering (specs/features/auth-access.md AC1/AC2).
export interface HeaderNav {
	links: Array<'how' | 'problems'>
	actions: Array<'signIn' | 'register'> | Array<'bell' | 'account'>
	// The primary button beside the account controls: a signed-in learner goes to
	// the dashboard. Signed-out visitors get Sign in / Register instead.
	cta: { label: 'dashboard'; href: '/dashboard' } | null
}

export function headerNav(authenticated: boolean): HeaderNav {
	return authenticated
		? {
				links: ['how', 'problems'],
				actions: ['bell', 'account'],
				cta: { label: 'dashboard', href: '/dashboard' }
			}
		: { links: ['how', 'problems'], actions: ['signIn', 'register'], cta: null }
}
