'use client'

import { useSyncExternalStore } from 'react'

// A timestamp in the viewer's own locale and time zone. The server can't know
// either, so it renders the UTC date only and the browser swaps in the local
// date (and time) after hydration (getServerSnapshot vs getSnapshot), with no
// hydration mismatch.
const noSubscription = () => () => {}

const DATE_ONLY: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
const DATE_TIME: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
}

export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
	const text = useSyncExternalStore(
		noSubscription,
		() => new Date(iso).toLocaleString(undefined, dateOnly ? DATE_ONLY : DATE_TIME),
		() => iso.slice(0, 10)
	)
	return <time dateTime={iso}>{text}</time>
}
