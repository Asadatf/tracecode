'use client'

import { useSyncExternalStore } from 'react'

// How much room the workspace has: 'wide' fits three columns, 'overlay' (768–1099px)
// is too narrow to squeeze the editor so a Tutor opens as a drawer, 'phone' is
// full screen. The server snapshot is 'wide', so the first render matches it.
export type ViewportMode = 'wide' | 'overlay' | 'phone'

const WIDE = '(min-width: 1100px)'
const MID = '(min-width: 768px)'

function subscribe(onChange: () => void) {
	const queries = [window.matchMedia(WIDE), window.matchMedia(MID)]
	for (const query of queries) query.addEventListener('change', onChange)
	return () => {
		for (const query of queries) query.removeEventListener('change', onChange)
	}
}

function snapshot(): ViewportMode {
	if (window.matchMedia(WIDE).matches) return 'wide'
	return window.matchMedia(MID).matches ? 'overlay' : 'phone'
}

export function useViewportMode(): ViewportMode {
	return useSyncExternalStore(subscribe, snapshot, () => 'wide')
}
