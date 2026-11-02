'use client'

import { useEffect } from 'react'

// Reveal this much before an element's top edge reaches the viewport bottom
// edge's 88% line, so the choreography is under way as it scrolls into view.
const ROOT_MARGIN = '0px 0px -12% 0px'

/**
 * Drives the landing page's scroll reveals. Server-rendered sections carry
 * `data-reveal`; this arms each one (`pending`) and flips it to `in` the first
 * time it scrolls into view. Nothing is hidden until this runs, so with no JS,
 * no IntersectionObserver or reduced motion the content is simply visible.
 * Once revealed a section stays revealed, so scrolling back up never blanks it.
 */
export function ScrollReveal() {
	useEffect(() => {
		if (typeof IntersectionObserver === 'undefined') return
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

		const targets = document.querySelectorAll<HTMLElement>('[data-reveal]')
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue
					entry.target.dataset.state = 'in'
					observer.unobserve(entry.target)
				}
			},
			{ rootMargin: ROOT_MARGIN }
		)
		for (const target of targets) {
			target.dataset.state = 'pending'
			observer.observe(target)
		}

		return () => {
			observer.disconnect()
			for (const target of targets) delete target.dataset.state
		}
	}, [])

	return null
}
