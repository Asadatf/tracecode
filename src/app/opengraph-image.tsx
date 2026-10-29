import { ImageResponse } from 'next/og'
import { SITE } from '@/lib/seo/site'

// The image every share card and citation card shows (og:image, and
// twitter:image through it). Replace the placeholder look with the brand's;
// a page that needs its own image adds an opengraph-image.tsx next to it.
export const alt = SITE.name
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: '#111827',
				color: '#ffffff',
				fontSize: 72,
				fontWeight: 700
			}}
		>
			{SITE.name}
		</div>,
		size
	)
}
