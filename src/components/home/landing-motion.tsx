'use client'

import { useEffect } from 'react'
import styles from './landing.module.css'

type Reveal = { selector: string; duration: number; delay?: number; from: Keyframe }

const reveals: Reveal[] = [
	{
		selector: '.' + styles.tourTopbar,
		duration: 650,
		from: { opacity: 0, transform: 'translateY(-12px)' }
	},
	{
		selector: '.' + styles.stageRail,
		duration: 650,
		delay: 100,
		from: { opacity: 0, transform: 'scaleX(.96)' }
	},
	{
		selector: '.' + styles.tourWorkspace,
		duration: 750,
		delay: 180,
		from: { opacity: 0, transform: 'translateY(16px)' }
	},
	{
		selector: '.' + styles.narrativeCopy,
		duration: 800,
		from: { opacity: 0, transform: 'translateX(-24px)' }
	},
	{
		selector: '.' + styles.narrativeVisual,
		duration: 900,
		from: { opacity: 0.2, transform: 'scale(.96)' }
	},
	{
		selector: '.' + styles.narrativeCode,
		duration: 650,
		delay: 120,
		from: { opacity: 0, transform: 'translateX(20px)' }
	},
	{
		selector: '.' + styles.narrativeArray,
		duration: 700,
		delay: 220,
		from: { opacity: 0, transform: 'translateY(18px)' }
	},
	{
		selector: '.' + styles.narrativePointers,
		duration: 550,
		delay: 400,
		from: { opacity: 0, transform: 'translateY(-12px)' }
	},
	{
		selector: '.' + styles.narrativeResult,
		duration: 700,
		delay: 550,
		from: { opacity: 0, transform: 'translateY(12px)' }
	},
	{
		selector: '.' + styles.sectionHeading + ', .' + styles.catalogIntro,
		duration: 800,
		from: { opacity: 0, transform: 'translateY(24px)' }
	},
	{
		selector: '.' + styles.loopCard,
		duration: 750,
		from: { opacity: 0, transform: 'translateY(32px) scale(.97)' }
	},
	{
		selector: '.' + styles.tableRow,
		duration: 550,
		from: { opacity: 0 }
	},
	{
		selector: '.' + styles.closing + ' > *',
		duration: 850,
		from: { opacity: 0, transform: 'translateY(20px) scale(.98)' }
	}
]

export function LandingMotion() {
	useEffect(() => {
		const root = document.documentElement
		root.dataset.landingMotion = 'true'
		const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
		const animations = new Set<Animation>()
		let observer: IntersectionObserver | undefined
		function configure() {
			observer?.disconnect()
			for (const animation of animations) animation.cancel()
			animations.clear()
			if (preference.matches || !('IntersectionObserver' in window)) return
			const targets = new Map<Element, { reveal: Reveal; delay: number }>()
			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (!entry.isIntersecting) continue
						const target = targets.get(entry.target)
						if (!target) continue
						const animation = entry.target.animate(
							[target.reveal.from, { opacity: 1, transform: 'none' }],
							{
								duration: target.reveal.duration,
								delay: target.delay,
								easing: 'cubic-bezier(.2,.7,.2,1)',
								fill: 'backwards'
							}
						)
						animations.add(animation)
						animation.onfinish = () => animations.delete(animation)
						observer?.unobserve(entry.target)
					}
				},
				{ threshold: 0.12 }
			)
			for (const reveal of reveals) {
				document.querySelectorAll(reveal.selector).forEach((element, index) => {
					targets.set(element, { reveal, delay: (reveal.delay ?? 0) + index * 90 })
					observer?.observe(element)
				})
			}
		}
		configure()
		preference.addEventListener('change', configure)
		return () => {
			delete root.dataset.landingMotion
			observer?.disconnect()
			preference.removeEventListener('change', configure)
			for (const animation of animations) animation.cancel()
		}
	}, [])
	return null
}
