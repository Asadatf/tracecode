// Public usernames (specs/features/public-profile-settings.md). Pure: the server
// calls it before every write and the form calls it for instant feedback, but only
// the server's verdict (and the database's unique index) decides anything.
//
// A username is lowercase letters, digits and single hyphens, 3-30 characters,
// starting and ending with a letter or digit. It is stored normalised, so a plain
// unique index is case-insensitive uniqueness, and it is safe in a URL path with no
// encoding.

export const USERNAME_MIN = 3
export const USERNAME_MAX = 30

export const USERNAME_ERRORS = [
	'too_short',
	'too_long',
	'invalid_chars',
	'hyphen_edge',
	'hyphen_double',
	'reserved'
] as const
export type UsernameError = (typeof USERNAME_ERRORS)[number]

// Names that would collide with, or be mistaken for, a route, a system account or
// the product itself. Every top-level route segment under src/app is guarded by a
// test, so adding a route without reserving it fails CI.
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
	// Routes (src/app and src/app/[locale]).
	'admin',
	'analytics-demo',
	'api',
	'apple-icon',
	'dashboard',
	'global-error',
	'icon',
	'llms',
	'llms-full',
	'login',
	'manifest',
	'opengraph-image',
	'practice',
	'problems',
	'progress',
	'register',
	'robots',
	'settings',
	'sitemap',
	'unsubscribe',
	// Routes the product is likely to add.
	'u',
	'user',
	'users',
	'profile',
	'profiles',
	'leaderboard',
	'leaderboards',
	'challenge',
	'challenges',
	'daily',
	'exam',
	'streak',
	'notifications',
	'search',
	'explore',
	'learn',
	'tutor',
	// The product and its roles.
	'tracecode',
	'trace-code',
	'tracy',
	'official',
	'staff',
	'team',
	'support',
	'help',
	'security',
	'moderator',
	'root',
	'system',
	'administrator',
	// Generic web and auth paths.
	'auth',
	'logout',
	'signin',
	'sign-in',
	'signup',
	'sign-up',
	'account',
	'accounts',
	'me',
	'new',
	'edit',
	'about',
	'terms',
	'privacy',
	'contact',
	'blog',
	'docs',
	'www',
	'mail',
	'static',
	'assets',
	'public',
	'null',
	'undefined',
	'anonymous',
	'everyone',
	'all'
])

// Trim, fold compatibility forms (full-width letters become ASCII) and lowercase.
export function normalizeUsername(input: string): string {
	return input.normalize('NFKC').trim().toLowerCase()
}

export type UsernameCheck = { ok: true; username: string } | { ok: false; error: UsernameError }

// Validates a username after normalising it; `username` is what to store.
export function checkUsername(input: string): UsernameCheck {
	const username = normalizeUsername(input)
	if (username.length < USERNAME_MIN) return { ok: false, error: 'too_short' }
	if (username.length > USERNAME_MAX) return { ok: false, error: 'too_long' }
	if (!/^[a-z0-9-]+$/.test(username)) return { ok: false, error: 'invalid_chars' }
	if (username.startsWith('-') || username.endsWith('-')) return { ok: false, error: 'hyphen_edge' }
	if (username.includes('--')) return { ok: false, error: 'hyphen_double' }
	if (RESERVED_USERNAMES.has(username)) return { ok: false, error: 'reserved' }
	return { ok: true, username }
}
