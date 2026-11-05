import { cn } from '@/lib/cn'

// The branded loading mark: the TraceCode logo with its green path drawing itself.
// The animation lives in the SVG files (public/brand/tracecode-loader*.svg) — the
// brackets stay still, the path draws, the nodes pulse — so nothing here animates
// anything and no animation library is involved.
//
// `tone` is the background it sits on, not the OS theme: app pages force a light
// scheme and the workspace, landing and profile force a dark one, so a
// prefers-color-scheme switch would pick the wrong file. 'dark' = white brackets for
// dark surfaces, 'light' = ink brackets for light surfaces.
//
// Reduced motion: the <picture> swaps to the existing static logo (same viewBox, so
// nothing moves). It is chosen on the page's own media query rather than left to the
// rule inside the SVG, which an <img> does not reliably receive.
//
// It is decorative on purpose. What is happening ("Running tests…", "Grading your
// submission…") is said by the status region next to it; this only adds the picture,
// so a screen reader never hears it twice.
const LOADERS = {
	dark: '/brand/tracecode-loader.svg',
	light: '/brand/tracecode-loader-light.svg'
} as const

const STILL_LOGOS = {
	dark: '/brand/tracecode-logo.svg',
	light: '/brand/tracecode-logo-light.svg'
} as const

// The artwork's viewBox is 1346 x 640; the height is derived so the box is reserved
// from the first paint and the swap to real content never shifts anything.
const ASPECT = 640 / 1346

export type TraceLoaderTone = keyof typeof LOADERS

export function TraceLoader({
	tone,
	width = 96,
	className
}: {
	tone: TraceLoaderTone
	width?: number
	className?: string
}) {
	return (
		<picture className="contents">
			<source media="(prefers-reduced-motion: reduce)" srcSet={STILL_LOGOS[tone]} />
			{/* A plain <img>: next/image cannot express a media-selected source. */}
			<img
				src={LOADERS[tone]}
				alt=""
				aria-hidden="true"
				width={width}
				height={Math.round(width * ASPECT)}
				decoding="async"
				draggable={false}
				className={cn('block h-auto max-w-full select-none', className)}
			/>
		</picture>
	)
}
