'use client'

import { useState, useSyncExternalStore } from 'react'
import { useLocale } from 'next-intl'
import { Link } from '@/i18n/routing'
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons'
import { monthLayout, monthOf, shiftMonth, dayIso } from '@/lib/calendar/month-grid'
import { CHALLENGE_EPOCH } from '@/lib/challenge/assignment'
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
	// "{date}" alone, for a past day whose assignment is not yet pinned.
	dayLabelPlain: string
	// "{date}: locked until it begins", for a future day.
	dayLocked: string
	// "{date}: no challenge" for a date before the product launched.
	dayNone: string
	// Shown on today's row until the assignment has been pinned.
	openToday: string
	// Shown on today's row once the learner has completed today's challenge, or has made
	// their one final submission that did not (or has not yet) passed.
	todayDone: string
	todaySubmitted: string
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

// A month of dates, each linking to that date's problem (problems-page
// AC8–AC10). Dates are UTC days, like the "UTC" chip says, and "today" comes
// from the server so the first render matches it.
export function ProblemCalendar({
	titles,
	pinned,
	todayIso,
	todayState,
	labels
}: {
	// Problem titles by slug.
	titles: Record<string, string>
	// The pinned daily challenge per UTC date (YYYY-MM-DD -> slug), today and earlier only.
	// Assignments are read from here, never recomputed, so a catalogue change cannot
	// change a date's problem; a future date is not in it and cannot be opened.
	pinned: Record<string, string>
	todayIso: string
	todayState: 'open' | 'submitted' | 'completed'
	labels: CalendarLabels
}) {
	const locale = useLocale()
	const now = useSyncExternalStore(subscribeClock, readClock, readServerClock)
	const [, , todayDay = 1] = todayIso.split('-').map(Number)
	const [view, setView] = useState(() => monthOf(todayIso))
	const {
		leading,
		daysInMonth,
		trailing,
		title: monthTitle,
		short: monthShort,
		weekdays
	} = monthLayout(view, locale)
	const dayFormat = new Intl.DateTimeFormat(locale, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	})

	function shift(by: number) {
		setView((current) => shiftMonth(current, by))
	}

	const todaySlug = pinned[todayIso]

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
						const iso = dayIso(view, day)
						const slug = pinned[iso]
						const title = slug == null ? undefined : titles[slug]
						const isToday = iso === todayIso
						const date = dayFormat.format(new Date(iso))
						// Before launch there is no challenge: shown, never a link.
						if (iso < CHALLENGE_EPOCH) {
							return (
								<span key={iso} role="gridcell">
									<span
										className={`${styles.day} ${styles.dayLocked}`}
										aria-disabled="true"
										aria-label={labels.dayNone.replace('{date}', date)}
										title={labels.dayNone.replace('{date}', date)}
									>
										{day}
									</span>
								</span>
							)
						}
						// A date that has not begun is locked: shown, never a link.
						if (iso > todayIso) {
							return (
								<span key={iso} role="gridcell">
									<span
										className={`${styles.day} ${styles.dayLocked}`}
										aria-disabled="true"
										aria-label={labels.dayLocked.replace('{date}', date)}
										title={labels.dayLocked.replace('{date}', date)}
									>
										{day}
									</span>
								</span>
							)
						}
						return (
							<span key={iso} role="gridcell">
								<Link
									// A past day goes straight to Practice for its problem; only today is the
									// challenge. (A past day not yet pinned still opens its challenge URL,
									// which pins it and redirects to Practice.)
									href={isToday || slug == null ? `/challenge/${iso}` : `/practice/${slug}`}
									className={isToday ? `${styles.day} ${styles.dayToday}` : styles.day}
									aria-current={isToday ? 'date' : undefined}
									aria-label={
										title == null
											? labels.dayLabelPlain.replace('{date}', date)
											: labels.dayLabel.replace('{date}', date).replace('{title}', title)
									}
									title={title}
								>
									{day}
								</Link>
							</span>
						)
					})}
					{/* Always six week rows, so the card is the same height every month. */}
					{Array.from({ length: trailing }, (_, index) => (
						<span key={`tail-${index}`} role="gridcell" />
					))}
				</div>
				<Link href={`/challenge/${todayIso}`} className={styles.todayRow}>
					<span>
						<span className={styles.todayLabel}>{labels.todaysProblem}</span>
						<strong>
							{todaySlug == null ? labels.openToday : (titles[todaySlug] ?? todaySlug)}
						</strong>
						{todayState === 'completed' ? (
							<span className={styles.todayLabel}>✓ {labels.todayDone}</span>
						) : null}
						{todayState === 'submitted' ? (
							<span className={styles.todayLabel}>{labels.todaySubmitted}</span>
						) : null}
					</span>
					<ArrowRightIcon size={18} />
				</Link>
			</div>
		</section>
	)
}
