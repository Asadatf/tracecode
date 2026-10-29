import type { MetadataRoute } from 'next'
import { isIndexable, siteUrl } from '@/lib/seo/site'

// /robots.txt. Every crawler, the AI retrieval ones included, may read every
// page on production; a preview, a local build or an internal tool
// (SITE.indexable false) disallows everything.
export default function robots(): MetadataRoute.Robots {
	if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } }
	return {
		rules: { userAgent: '*', allow: '/', disallow: '/api/' },
		sitemap: `${siteUrl()}/sitemap.xml`
	}
}
