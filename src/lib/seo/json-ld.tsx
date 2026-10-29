import { SITE, siteUrl } from './site'

// Structured data as JSON-LD, the form Google and the answer engines read.
// The root layout renders Organization and WebSite on every page, which is
// the answer to "who publishes this" (choose.schema.identity). A page below
// the root adds its own trail with breadcrumbJsonLd().

type JsonLdData = Record<string, unknown>

export function JsonLd({ data }: { data: JsonLdData }) {
	return (
		<script
			type="application/ld+json"
			// `<` escaped so a string in the data can't close the script tag.
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
		/>
	)
}

export function organizationJsonLd(): JsonLdData {
	return {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: SITE.name,
		url: siteUrl(),
		logo: `${siteUrl()}/icon.svg`,
		...(SITE.contactEmail == null ? {} : { email: SITE.contactEmail }),
		...(SITE.sameAs.length === 0 ? {} : { sameAs: SITE.sameAs })
	}
}

export function webSiteJsonLd(locale: string): JsonLdData {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: SITE.name,
		url: siteUrl(),
		inLanguage: locale
	}
}

/** The trail from the home page down to this one, each with its served path. */
export function breadcrumbJsonLd(trail: readonly { name: string; path: string }[]): JsonLdData {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: trail.map((crumb, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: crumb.name,
			item: `${siteUrl()}${crumb.path}`
		}))
	}
}
