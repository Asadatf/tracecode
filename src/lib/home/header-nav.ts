// What the landing header shows, as data, so signed-out and signed-in
// navigation can be asserted without rendering (specs/features/auth-access.md AC1/AC2).
export interface HeaderNav {
	links: Array<'how' | 'problems' | 'progress'>
	actions: Array<'signIn' | 'register'> | Array<'bell' | 'account'>
}

export function headerNav(authenticated: boolean): HeaderNav {
	return authenticated
		? { links: ['how', 'problems', 'progress'], actions: ['bell', 'account'] }
		: { links: ['how', 'problems'], actions: ['signIn', 'register'] }
}
