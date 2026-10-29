import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { getPathname, routing } from '@/i18n/routing'
import type { LlmsPage } from './llms'
import { PUBLIC_PAGES, pageCopy, publicPage } from './pages'
import { SITE, isIndexable, siteUrl } from './site'

// What every public page puts in its head, built one way so no page can ship
// half of it (docs/rules/seo.md). A page's file only says which path it is:
//
//   export async function generateMetadata({ params }) {
//     return pageMetadata({ path: '/pricing', locale: (await params).locale })
//   }

type Locale = (typeof routing.locales)[number]

function toLocale(locale: string): Locale {
	return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
}

/** The path as served in `locale`: unprefixed for the default locale ('as-needed'). */
export function localizedPath(path: string, locale: string): string {
	return getPathname({ href: path, locale: toLocale(locale) })
}

/**
 * Indexable pages also allow large image previews and unlimited snippets, so
 * an answer engine can quote them (choose.snippet.directives).
 */
export function robotsFor(noIndex = false): Metadata['robots'] {
	if (noIndex || !isIndexable()) return { index: false, follow: false }
	return {
		index: true,
		follow: true,
		'max-image-preview': 'large',
		'max-snippet': -1,
		'max-video-preview': -1
	}
}

export async function pageMetadata({
	path,
	locale
}: {
	path: string
	locale: string
}): Promise<Metadata> {
	const page = publicPage(path)
	const { title, description } = pageCopy(await getMessages({ locale }), page.messages)
	// Relative here; metadataBase in the root layout makes it absolute.
	const canonical = localizedPath(path, locale)
	return {
		title: { absolute: title },
		description,
		alternates: {
			canonical,
			languages: Object.fromEntries([
				...routing.locales.map((each) => [each, localizedPath(path, each)]),
				['x-default', localizedPath(path, routing.defaultLocale)]
			])
		},
		// The share card (choose.social.card). The image is named here because a
		// page's openGraph replaces the one app/opengraph-image.tsx would add; an
		// opengraph-image file beside a page still overrides it for that page.
		openGraph: {
			type: 'website',
			url: canonical,
			siteName: SITE.name,
			title,
			description,
			locale,
			images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: SITE.name }]
		},
		twitter: { card: 'summary_large_image', title, description },
		robots: robotsFor()
	}
}

/** The public pages in the default locale, for llms.txt and llms-full.txt. */
export async function llmsPages(): Promise<LlmsPage[]> {
	const messages = await getMessages({ locale: routing.defaultLocale })
	return PUBLIC_PAGES.map((page) => ({
		...pageCopy(messages, page.messages),
		url: `${siteUrl()}${localizedPath(page.path, routing.defaultLocale)}`
	}))
}
