// The sidebar's collapsed choice travels in a cookie, not localStorage, so the
// server can render the right width on the first paint of every page: no
// expanded-then-collapsed flash when a page loads or you move between pages.
export const SIDEBAR_COOKIE = 'tc-sidebar'
export const SIDEBAR_COLLAPSED = '1'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function sidebarCookie(collapsed: boolean): string {
	return `${SIDEBAR_COOKIE}=${collapsed ? SIDEBAR_COLLAPSED : '0'}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`
}
