// Where to send a learner after they authenticate. `next` arrives from the URL
// or a form field, so it is untrusted: only a same-origin absolute path is
// followed, and never one that lands back on an auth page (a redirect loop).
export const DEFAULT_RETURN_TO = '/dashboard'

const AUTH_PATHS = new Set(['/login', '/register'])
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/
const PARSE_BASE = 'http://return-to.invalid'

export function safeReturnTo(next: string | null | undefined): string {
	if (next == null || !next.startsWith('/') || next.startsWith('//') || UNSAFE_CHARS.test(next)) {
		return DEFAULT_RETURN_TO
	}
	let url: URL
	try {
		url = new URL(next, PARSE_BASE)
	} catch {
		return DEFAULT_RETURN_TO
	}
	if (url.origin !== PARSE_BASE || AUTH_PATHS.has(url.pathname.replace(/\/+$/, ''))) {
		return DEFAULT_RETURN_TO
	}
	return `${url.pathname}${url.search}${url.hash}`
}

// `/login?next=…` for a destination, or plain `/login` when there is none.
export function authHref(page: 'login' | 'register', next: string | null | undefined): string {
	if (next == null) return `/${page}`
	const safe = safeReturnTo(next)
	return safe === DEFAULT_RETURN_TO && next !== DEFAULT_RETURN_TO
		? `/${page}`
		: `/${page}?next=${encodeURIComponent(safe)}`
}
