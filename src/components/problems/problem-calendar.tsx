'use client'

import { useState, useSyncExternalStore } from 'react'
import { useLocale } from 'next-intl'
import { Link } from '@/i18n/routing'
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons'
import { isoDate, problemForDate } from '@/lib/problems/daily-problem'
import styles from './problems.module.css'

export interface CalendarLabels {
	previous: string
	next: string
	todaysProblem: string
	// "Day {day}" and "{time} left" (until the UTC day ends).
	dayHeading: string
	timeLeft: string
	// "{date}: {title}" for a day's link, spoken by screen readers.
	dayLabel: string
}

// One shared clock tick per second. The server snapshot is null, so the first
// render matches the server and the countdown appears after hydration.
let clock = 0
const clockListeners = new Set<() => void>()
let clockTimer: ReturnType<typeof setInterval> | undefined

function subscribeClock(listener: () => void) {
	clockListeners.add(listener)
	if (clockTimer == null) {
		clock = Date.now()
		// Tell the first subscriber right away instead of after a second.
		queueMicrotask(() => listener())
		clockTimer = setInterval(() => {
			clock = Date.now()
			clockListeners.forEach((notify) => notify())
		}, 1000)
	}
	return () => {
		clockListeners.delete(listener)
		if (clockListeners.size === 0 && clockTimer != null) {
			clearInterval(clockTimer)
			clockTimer = undefined
		}
	}
}
const readClock = () => (clock === 0 ? null : clock)
const readServerClock = () => null

function pad(value: number): string {
	return String(value).padStart(2, '0')
}

// HH:MM:SS until the next UTC midnight.
function timeUntilUtcMidnight(now: number): string {
	const date = new Date(now)
	const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
	const seconds = Math.max(0, Math.floor((next - now) / 1000))
	return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
}

const GRID_CELLS = 42 // 6 week rows x 7 days
const WEEKDAY_SUNDAY = Date.UTC(2023, 0, 1)
const DAY_MS = 86_400_000

// A month of dates, each linking to that date's problem (problems-page
// AC8–AC10). Dates are UTC days, like the "UTC" chip says, and "today" comes
// from the server so the first render matches it.
export function ProblemCalendar({
	slugs,
	titles,
	todayIso,
	labels
}: {
	slugs: string[]
	titles: Record<string, string>
	todayIso: string
	labels: CalendarLabels
}) {
	const locale = useLocale()
	const now = useSyncExternalStore(subscribeClock, readClock, readServerClock)
	const [todayYear = 1970, todayMonth = 1, todayDay = 1] = todayIso.split('-').map(Number)
	const [view, setView] = useState({ year: todayYear, month: todayMonth - 1 })

	const first = new Date(Date.UTC(view.year, view.month, 1))
	const leading = first.getUTCDay()
	const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate()
	const monthTitle = new Intl.DateTimeFormat(locale, {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(first)
	const monthShort = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
		.format(first)
		.toLocaleUpperCase(locale)
	const weekdays = Array.from({ length: 7 }, (_, index) =>
		new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
			new Date(WEEKDAY_SUNDAY + index * DAY_MS)
		)
	)
	const dayFormat = new Intl.DateTimeFormat(locale, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	})

	function shift(by: number) {
		setView(({ year, month }) => {
			const next = new Date(Date.UTC(year, month + by, 1))
			return { year: next.getUTCFullYear(), month: next.getUTCMonth() }
		})
	}

	const todaySlug = problemForDate(slugs, todayIso)

	return (
		<section
			aria-labelledby="problems-calendar"
			className={styles.calCard}
			// The accent hue rotates by month (CSS keys off this); the layout never changes.
			data-month={view.month + 1}
		>
			<div className={styles.strip}>
				<div className={styles.stripLeft}>
					<h2 id="problems-calendar" className={styles.calTitle}>
						{labels.dayHeading.replace('{day}', String(todayDay))}
					</h2>
					<span className={styles.timeLeft}>
						{labels.timeLeft.replace(
							'{time}',
							now == null ? '--:--:--' : timeUntilUtcMidnight(now)
						)}
					</span>
					<span className={styles.utc}>UTC</span>
				</div>
				<div className={styles.stripRight}>
					<button
						type="button"
						className={styles.navButton}
						aria-label={labels.previous}
						onClick={() => shift(-1)}
					>
						<ChevronLeftIcon size={16} />
					</button>
					<span className={styles.hexSlot} aria-hidden="true">
						<span className={styles.hexRim}>
							<span className={styles.hexRing}>
								<span className={styles.hexLine}>
									<span className={styles.hexCore}>
										<strong>{view.month + 1}</strong>
										<small>{monthShort}</small>
									</span>
								</span>
							</span>
						</span>
					</span>
					<button
						type="button"
						className={styles.navButton}
						aria-label={labels.next}
						onClick={() => shift(1)}
					>
						<ChevronRightIcon size={16} />
					</button>
				</div>
			</div>
			<div className={styles.body}>
				<p className={styles.month} aria-live="polite">
					{monthTitle}
				</p>
				<div className={styles.grid} role="grid" aria-label={monthTitle}>
					{weekdays.map((day, index) => (
						<span key={index} className={styles.weekday} role="columnheader">
							{day}
						</span>
					))}
					{Array.from({ length: leading }, (_, index) => (
						<span key={`blank-${index}`} role="gridcell" />
					))}
					{Array.from({ length: daysInMonth }, (_, index) => {
						const day = index + 1
						const iso = isoDate(view.year, view.month, day)
						const slug = problemForDate(slugs, iso)
						const title = slug == null ? undefined : titles[slug]
						const isToday = iso === todayIso
						return (
							<span key={iso} role="gridcell">
								{slug == null ? (
									<span className={styles.day}>{day}</span>
								) : (
									<Link
										href={`/practice/${slug}`}
										className={isToday ? `${styles.day} ${styles.dayToday}` : styles.day}
										aria-current={isToday ? 'date' : undefined}
										aria-label={labels.dayLabel
											.replace('{date}', dayFormat.format(new Date(iso)))
											.replace('{title}', title ?? slug)}
										title={title}
									>
										{day}
									</Link>
								)}
							</span>
						)
					})}
					{/* Always six week rows, so the card is the same height every month. */}
					{Array.from({ length: Math.max(0, GRID_CELLS - leading - daysInMonth) }, (_, index) => (
						<span key={`tail-${index}`} role="gridcell" />
					))}
				</div>
				{todaySlug != null ? (
					<Link href={`/practice/${todaySlug}`} className={styles.todayRow}>
						<span>
							<span className={styles.todayLabel}>{labels.todaysProblem}</span>
							<strong>{titles[todaySlug] ?? todaySlug}</strong>
						</span>
						<ArrowRightIcon size={18} />
					</Link>
				) : null}
			</div>
		</section>
	)
}
