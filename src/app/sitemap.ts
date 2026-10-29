import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'
import { localizedPath } from '@/lib/seo/metadata'
import { PUBLIC_PAGES } from '@/lib/seo/pages'
import { isIndexable, siteUrl } from '@/lib/seo/site'

// /sitemap.xml, from PUBLIC_PAGES: every page in every locale, each naming
// its translations. No changefreq or priority, which Google has never read
// (tech.sitemap.deprecated).
export default function sitemap(): MetadataRoute.Sitemap {
	if (!isIndexable()) return []
	const urlOf = (path: string, locale: string) => `${siteUrl()}${localizedPath(path, locale)}`
	return PUBLIC_PAGES.flatMap((page) =>
		routing.locales.map((locale) => ({
			url: urlOf(page.path, locale),
			lastModified: page.lastModified,
			alternates: {
				languages: Object.fromEntries(routing.locales.map((each) => [each, urlOf(page.path, each)]))
			}
		}))
	)
}
