'use client'

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode
} from 'react'
import { useTranslations } from 'next-intl'
import { TraceLoader, type TraceLoaderTone } from '@/components/ui/trace-loader'
import styles from './navigation-curtain.module.css'

// The curtain: a translucent wash with the branded loader that sits over the page you
// are leaving while the next one loads, instead of a loading screen that replaces it.
//
// Why it works this way. A route's `loading.tsx` swaps the old page for its fallback the
// moment you navigate — that is the "two separate pages" effect this avoids. With no
// `loading.tsx`, Next keeps the old page on screen until the new one is ready, and the
// only signal that a navigation is in flight is `useLinkStatus`, which only exists inside
// a <Link>. So every <Link> (components/navigation/curtain-link) reports into this one
// host, which lives in the root layout and therefore outlives the page: when the new
// page arrives and the link that was pending unmounts, the curtain fades out over the
// destination rather than vanishing with the old page.
//
// Not covered, on purpose: a hard load or refresh (there is no previous page to keep
// under it) and navigation started in code with router.push (no link to read the state
// from). Those behave exactly as they would without the curtain.

type Reporter = (active: boolean, tone: TraceLoaderTone) => void

const CurtainContext = createContext<Reporter | null>(null)
// The page background a link sits on. It is declared by the page, not read from the OS
// colour scheme: the landing page and public profile are dark and the app is light
// whatever the visitor's system says.
const SurfaceContext = createContext<TraceLoaderTone>('light')

// A navigation that has not settled by now stops dimming the page. The curtain never
// blocks the pointer or the keyboard, so this is only about not leaving a veil up for
// good if a request hangs; the navigation itself carries on or fails as Next decides.
const MAX_VISIBLE_MS = 15_000

export function Surface({ tone, children }: { tone: TraceLoaderTone; children: ReactNode }) {
	return <SurfaceContext value={tone}>{children}</SurfaceContext>
}

type CurtainState = { active: boolean; tone: TraceLoaderTone }

export function NavigationCurtainProvider({ children }: { children: ReactNode }) {
	const t = useTranslations('Navigation')
	const [state, setState] = useState<CurtainState>({ active: false, tone: 'light' })

	const report = useCallback<Reporter>((active, tone) => {
		setState((prev) =>
			active ? { active: true, tone } : prev.active ? { ...prev, active: false } : prev
		)
	}, [])

	const { active } = state
	useEffect(() => {
		if (!active) return
		const timer = setTimeout(() => setState((prev) => ({ ...prev, active: false })), MAX_VISIBLE_MS)
		return () => clearTimeout(timer)
	}, [active])

	// Both loaders are in the page from the start so the one the surface needs is already
	// downloaded when the first navigation begins; the unused one is display:none.
	const toneClass = state.tone === 'dark' ? styles.dark : styles.light
	const status = useMemo(() => (active ? t('loading') : ''), [active, t])

	return (
		<CurtainContext value={report}>
			{children}
			<div className={`${styles.curtain} ${toneClass}`} data-active={active} aria-hidden="true">
				<div className={styles.inner}>
					<span className={styles.forLight}>
						<TraceLoader tone="light" width={112} />
					</span>
					<span className={styles.forDark}>
						<TraceLoader tone="dark" width={112} />
					</span>
					<p className={styles.label}>{t('loading')}</p>
				</div>
			</div>
			{/* The curtain itself is decorative; this is what a screen reader hears. */}
			<div role="status" aria-live="polite" className="sr-only">
				{status}
			</div>
		</CurtainContext>
	)
}

// Called by whatever knows a navigation is in flight. Safe with no provider (tests,
// isolated renders): it then does nothing.
export function useReportNavigationPending(pending: boolean) {
	const report = useContext(CurtainContext)
	const tone = useContext(SurfaceContext)
	useEffect(() => {
		if (!pending || report == null) return
		report(true, tone)
		return () => report(false, tone)
	}, [pending, report, tone])
}
