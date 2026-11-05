'use client'

import type { ComponentProps } from 'react'
import { useLinkStatus } from 'next/link'
import { Link as LocaleLink } from '@/i18n/navigation'
import { useReportNavigationPending } from './navigation-curtain'

// Renders nothing; it exists because useLinkStatus only works in a child of a <Link>.
function PendingReporter() {
	const { pending } = useLinkStatus()
	useReportNavigationPending(pending)
	return null
}

// The locale-aware Link, plus the curtain while its navigation is in flight. Exported
// as `Link` from '@/i18n/routing', so every link in the app gets it without changing a
// call site. The reporter adds no DOM, so it cannot affect a link's layout.
export function Link({ children, ...props }: ComponentProps<typeof LocaleLink>) {
	return (
		<LocaleLink {...props}>
			{children}
			<PendingReporter />
		</LocaleLink>
	)
}
