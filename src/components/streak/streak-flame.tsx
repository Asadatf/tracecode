'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import { cn } from '@/lib/cn'
import { ChevronLeftIcon, ChevronRightIcon, FlameIcon } from '@/components/ui/icons'
import { dayIso, monthLayout, monthOf, shiftMonth } from '@/lib/calendar/month-grid'
import styles from './streak.module.css'

export interface StreakLabels {
	heading: string
	open: string
	// The button's spoken state, already resolved for the count ("3 day streak, active").
	status: string
	unavailable: string
	current: string
	longest: string
	hint: string
	previous: string
	next: string
	practiced: string
	today: string
	// "{date}, practiced"
	dayPracticed: string
	utc: string
}

export interface StreakData {
	current: number
	longest: number
	// Values already formatted for display ("3 days").
	currentText: string
	longestText: string
	active: boolean
	today: string
	activeDays: string[]
}

// The toolbar flame and its popover (specs/features/streak.md). It only ever shows
// what the server derived from saved attempts: `data` is null when that is not
// available, and the flame then stays neutral with no number.
export function StreakFlame({ data, labels }: { data: StreakData | null; labels: StreakLabels }) {
	const locale = useLocale()
	const [open, setOpen] = useState(false)
	const [view, setView] = useState(() => monthOf(data?.today ?? '1970-01-01'))
	const rootRef = useRef<HTMLDivElement>(null)
	const buttonRef = useRef<HTMLButtonElement>(null)

	// Close on Escape (returning focus to the flame) or a click outside.
	useEffect(() => {
		if (!open) return
		function onKey(event: KeyboardEvent) {
			if (event.key !== 'Escape') return
			setOpen(false)
			buttonRef.current?.focus()
		}
		function onPointer(event: PointerEvent) {
			if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
		}
		document.addEventListener('keydown', onKey)
		document.addEventListener('pointerdown', onPointer)
		return () => {
			document.removeEventListener('keydown', onKey)
			document.removeEventListener('pointerdown', onPointer)
		}
	}, [open])

	const active = data?.active === true
	const layout = monthLayout(view, locale)
	const practiced = new Set(data?.activeDays)
	const dayFormat = new Intl.DateTimeFormat(locale, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	})

	function toggle() {
		if (!open && data != null) setView(monthOf(data.today))
		setOpen(!open)
	}

	return (
		<div ref={rootRef} className={styles.root}>
			<button
				ref={buttonRef}
				type="button"
				onClick={toggle}
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-label={`${labels.open}: ${labels.status}`}
				className={styles.flame}
				data-streak={active ? 'active' : 'neutral'}
			>
				<FlameIcon size={20} />
				{active && data != null ? (
					<span aria-hidden="true" className={styles.count}>
						{data.current}
					</span>
				) : null}
			</button>

			{open ? (
				<div role="dialog" aria-label={labels.heading} className={styles.panel}>
					<div className={styles.head}>
						<span className={cn(styles.headFlame, active && styles.headFlameOn)}>
							<FlameIcon size={22} />
						</span>
						<h2 className={styles.title}>{labels.heading}</h2>
						<span className={styles.utc}>{labels.utc}</span>
					</div>

					{data == null ? (
						<p className={styles.note}>{labels.unavailable}</p>
					) : (
						<>
							<dl className={styles.stats}>
								<div>
									<dt>{labels.current}</dt>
									<dd className={cn(active && styles.statOn)}>{data.currentText}</dd>
								</div>
								<div>
									<dt>{labels.longest}</dt>
									<dd>{data.longestText}</dd>
								</div>
							</dl>
							<p className={styles.note}>{labels.hint}</p>

							<div className={styles.monthRow}>
								<button
									type="button"
									className={styles.nav}
									aria-label={labels.previous}
									onClick={() => setView((current) => shiftMonth(current, -1))}
								>
									<ChevronLeftIcon size={16} />
								</button>
								<p className={styles.month} aria-live="polite">
									{layout.title}
								</p>
								<button
									type="button"
									className={styles.nav}
									aria-label={labels.next}
									onClick={() => setView((current) => shiftMonth(current, 1))}
								>
									<ChevronRightIcon size={16} />
								</button>
							</div>
							<div className={styles.grid} role="grid" aria-label={layout.title}>
								{layout.weekdays.map((day, index) => (
									<span key={index} className={styles.weekday} role="columnheader">
										{day}
									</span>
								))}
								{Array.from({ length: layout.leading }, (_, index) => (
									<span key={`blank-${index}`} role="gridcell" />
								))}
								{Array.from({ length: layout.daysInMonth }, (_, index) => {
									const day = index + 1
									const iso = dayIso(view, day)
									const done = practiced.has(iso)
									return (
										<span key={iso} role="gridcell">
											<span
												className={cn(
													styles.day,
													done && styles.dayDone,
													iso === data.today && styles.dayToday
												)}
												aria-current={iso === data.today ? 'date' : undefined}
												aria-label={
													done
														? labels.dayPracticed.replace(
																'{date}',
																dayFormat.format(new Date(`${iso}T00:00:00Z`))
															)
														: undefined
												}
											>
												{day}
											</span>
										</span>
									)
								})}
								{Array.from({ length: layout.trailing }, (_, index) => (
									<span key={`tail-${index}`} role="gridcell" />
								))}
							</div>
							<p className={styles.legend}>
								<span className={cn(styles.swatch, styles.dayDone)} aria-hidden="true" />
								{labels.practiced}
								<span className={cn(styles.swatch, styles.dayToday)} aria-hidden="true" />
								{labels.today}
							</p>
						</>
					)}
				</div>
			) : null}
		</div>
	)
}
