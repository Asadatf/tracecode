'use client'

import { useEffect, useRef } from 'react'
import styles from './landing-cursor.module.css'

const NATIVE_AREAS =
	'input, textarea, select, code, pre, p, h1, h2, h3, td, [contenteditable="true"]'

export function LandingCursor() {
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const overlay = ref.current
		const page = overlay?.parentElement
		if (!overlay || !page) return
		const eligible = window.matchMedia(
			'(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'
		)
		let frame = 0
		let x = 0
		let y = 0
		let isInside = false
		function hide() {
			page?.removeAttribute('data-cursor')
			overlay?.removeAttribute('data-visible')
		}
		function paint() {
			frame = 0
			if (!eligible.matches || !isInside || !overlay || !page) return hide()
			const target = document.elementFromPoint(x, y)
			const isControl = target?.closest('a, button, summary')
			if (!target || !page.contains(target) || (!isControl && target.closest(NATIVE_AREAS)))
				return hide()
			overlay.style.transform = 'translate3d(' + (x - 2) + 'px,' + (y - 2) + 'px,0)'
			overlay.dataset.visible = 'true'
			overlay.dataset.interactive = String(Boolean(isControl))
			overlay.dataset.dark = String(Boolean(target.closest('[data-cursor-dark]')))
			page.dataset.cursor = 'active'
		}
		function schedule() {
			if (!frame) frame = requestAnimationFrame(paint)
		}
		function move(event: PointerEvent) {
			isInside = event.pointerType === 'mouse'
			x = event.clientX
			y = event.clientY
			schedule()
		}
		function leave() {
			isInside = false
			hide()
		}
		function change() {
			hide()
			schedule()
		}
		page.dataset.cursorReady = 'true'
		page.addEventListener('pointermove', move, { passive: true })
		page.addEventListener('pointerleave', leave)
		window.addEventListener('blur', leave)
		window.addEventListener('scroll', schedule, { passive: true, capture: true })
		eligible.addEventListener('change', change)
		return () => {
			cancelAnimationFrame(frame)
			delete page.dataset.cursorReady
			hide()
			page.removeEventListener('pointermove', move)
			page.removeEventListener('pointerleave', leave)
			window.removeEventListener('blur', leave)
			window.removeEventListener('scroll', schedule, true)
			eligible.removeEventListener('change', change)
		}
	}, [])
	return (
		<div ref={ref} className={styles.cursor} aria-hidden="true" data-landing-cursor>
			<svg width="28" height="34" viewBox="0 0 28 34" fill="none">
				<path
					d="M2 2 L24 20 L14 21 L10 31 L2 2Z"
					stroke="white"
					strokeWidth="1.7"
					strokeLinejoin="round"
				/>
			</svg>
		</div>
	)
}
