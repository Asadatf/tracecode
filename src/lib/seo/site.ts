// How the site describes itself to search engines and answer engines, in one
// place. template-setup fills it in; docs/rules/seo.md says what each field is
// for and which ones have to be set before launch. Free of next-intl and Next
// so node:test can import it.

export interface SiteConfig {
	/** One name, used everywhere a crawler reads one: og:site_name, Organization, WebSite. */
	readonly name: string
	/**
	 * false for an internal tool: every page is noindex and robots.txt
	 * disallows everything, on production too.
	 */
	readonly indexable: boolean
	/** Profiles that confirm who publishes the site (LinkedIn, X, GitHub), as full URLs. */
	readonly sameAs: readonly string[]
	/** Shown in the footer and in the Organization markup. null leaves it out. */
	readonly contactEmail: string | null
	/** Footer links to the privacy policy and terms, a path on this site or a full URL. */
	readonly privacyHref: string | null
	readonly termsHref: string | null
	/** Search Console and Bing Webmaster Tools tokens. Public by design: they sit in the head. */
	readonly verification: { readonly google: string | null; readonly bing: string | null }
}

export const SITE: SiteConfig = {
	name: 'TraceCode',
	indexable: true,
	sameAs: [],
	contactEmail: null,
	privacyHref: null,
	termsHref: null,
	verification: { google: null, bing: null }
}

/**
 * The production origin, from NEXT_PUBLIC_APP_URL. Canonicals, the sitemap and
 * llms.txt are written against it, so it has to be the real domain in
 * production, never a *.vercel.app address.
 */
export function siteUrl(): string {
	return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

/**
 * Whether search engines may index this deployment: production only, and only
 * for a site that is meant to be found. Previews and local builds are noindex.
 * The production deployment's *.vercel.app alias also reports production, so
 * next.config.ts sends it an X-Robots-Tag: noindex by host.
 */
export function isIndexable(): boolean {
	return SITE.indexable && process.env.VERCEL_ENV === 'production'
}
