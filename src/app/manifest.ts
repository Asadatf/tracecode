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
		icons: [
			{ src: '/brand/tracecode-icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
			{ src: '/brand/tracecode-icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' }
		]
	}
}
