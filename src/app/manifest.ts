import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/seo/site'

// /manifest.webmanifest: the name and icon a browser uses when the site is
// installed or pinned.
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: SITE.name,
		short_name: SITE.name,
		start_url: '/',
		display: 'standalone',
		icons: [{ src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' }]
	}
}
