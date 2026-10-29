import { ImageResponse } from 'next/og'

// The home-screen icon iOS asks for, which has to be a PNG. Same mark as icon.svg.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
				fontSize: 80,
				fontWeight: 700
			}}
		>
			A
		</div>,
		size
	)
}
