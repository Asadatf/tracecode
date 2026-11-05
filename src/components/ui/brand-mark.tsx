import Image from 'next/image'
import { cn } from '@/lib/cn'

// The TraceCode logo as it appears beside the wordmark in every header. It is the static
// brand file (public/brand), never redrawn here. `tone` is the surface it sits on, as for
// TraceLoader: 'dark' = white brackets for dark surfaces, 'light' = ink brackets for light
// ones. 'auto' is only for the few pages whose colours follow the OS scheme (no forced
// light/dark surface); it shows both files and lets prefers-color-scheme pick one.
// Decorative: the link around it carries the name.
const SOURCES = {
	dark: '/brand/tracecode-logo.svg',
	light: '/brand/tracecode-logo-light.svg'
} as const

// The artwork's viewBox is 1346 x 640; height follows from width so the box is reserved up front.
const ASPECT = 640 / 1346

export type BrandMarkTone = 'light' | 'dark' | 'auto'

function Mark({
	tone,
	width,
	className
}: {
	tone: 'light' | 'dark'
	width: number
	className?: string
}) {
	return (
		<Image
			src={SOURCES[tone]}
			alt=""
			aria-hidden="true"
			width={width}
			height={Math.round(width * ASPECT)}
			unoptimized
			draggable={false}
			className={cn('block h-auto shrink-0 select-none', className)}
		/>
	)
}

export function BrandMark({
	tone,
	width = 52,
	className
}: {
	tone: BrandMarkTone
	width?: number
	className?: string
}) {
	if (tone !== 'auto') return <Mark tone={tone} width={width} className={className} />
	return (
		<>
			<Mark tone="light" width={width} className={cn('dark:hidden', className)} />
			<Mark tone="dark" width={width} className={cn('hidden dark:block', className)} />
		</>
	)
}
