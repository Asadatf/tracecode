'use client'

import { useEffect } from 'react'

const ROOT_MARGIN = '0px 0px -12% 0px'

export function ScrollReveal() {
	useEffect(() => {
		const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
		const targets = document.querySelectorAll<HTMLElement>('[data-reveal]')
		let observer: IntersectionObserver | undefined
		function configure() {
			observer?.disconnect()
			for (const target of targets) delete target.dataset.state
			if (preference.matches || typeof IntersectionObserver === 'undefined') return
			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue
						entry.target.dataset.state = 'in'
						observer?.unobserve(entry.target)
					}
				},
				{ rootMargin: ROOT_MARGIN }
			)
			for (const target of targets) {
				target.dataset.state = 'pending'
				observer.observe(target)
			}
		}
		function focus(event: FocusEvent) {
			if (!(event.target instanceof Element)) return
			const section = event.target.closest<HTMLElement>('[data-reveal]')
			if (section) {
				section.dataset.state = 'in'
				observer?.unobserve(section)
			}
		}
		configure()
		preference.addEventListener('change', configure)
		document.addEventListener('focusin', focus)
		return () => {
			observer?.disconnect()
			preference.removeEventListener('change', configure)
			document.removeEventListener('focusin', focus)
			for (const target of targets) delete target.dataset.state
		}
	}, [])
	return null
}
