'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import type { DailyActivity } from '@/lib/activity/daily-activity'
import { WEEKDAYS, buildHeatmapGrid, type HeatmapCell } from '@/lib/activity/heatmap-grid'
import styles from './activity.module.css'

// The contribution graph (specs/features/activity-heatmap.md): about twelve months
// of UTC days, one column per week, one row per weekday, shaded by how many
// qualifying runs the learner completed that day. It shows ACTUAL PRACTICE
// ACTIVITY only — not proficiency and not verified skill — and says so. It is a
// plain presentational component (days + today in, markup out) so the public
// profile can reuse it; the card around it belongs to the host page.
//
// `days` null = the activity could not be read: it says so and draws nothing,
// rather than an all-empty grid that would read as "no practice".
//
// Accessibility: a labelled grid with one tab stop (roving tabindex); arrow keys
// move between days, Home/End jump to the row's ends, and every cell has a full
// text label. The live line under the graph repeats the focused or hovered day,
// so the detail is not tooltip-only.

const LABELLED_ROWS = new Set([1, 3, 5])
// Sunday, so index = getUTCDay().
const SUNDAY_UTC = Date.UTC(2023, 0, 1)
const DAY_MS = 86_400_000

export function ActivityHeatmap({
	days,
	today,
	headingId,
	showDisclaimer = true
}: {
	days: readonly DailyActivity[] | null
	today: string
	// The id of the heading that names this graph, when the host page has one.
	headingId?: string
	// The one-line explainer under the graph. A page that already says it elsewhere,
	// or wants a quieter card, can leave it out; the labels and tooltips stay.
	showDisclaimer?: boolean
}) {
	const t = useTranslations('Activity')
	const locale = useLocale()
	const scrollerRef = useRef<HTMLDivElement>(null)
	const gridRef = useRef<HTMLDivElement>(null)
	const [focusAt, setFocusAt] = useState<{ week: number; weekday: number } | null>(null)
	const [shownDay, setShownDay] = useState<string | null>(null)

	// Newest weeks are on the right; start scrolled there on a narrow screen.
	useEffect(() => {
		const scroller = scrollerRef.current
		if (scroller != null) scroller.scrollLeft = scroller.scrollWidth
	}, [days])

	if (days == null) {
		return (
			<p className={styles.note} role="status">
				{t('unavailable')}
			</p>
		)
	}

	const grid = buildHeatmapGrid(days, today)
	const weekCount = grid.weeks.length
	const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
	const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
	const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
	const labelAt = new Map(grid.monthLabels.map((label) => [label.week, label]))

	function describe(cell: HeatmapCell): string {
		const date = dateFormat.format(new Date(`${cell.day}T00:00:00.000Z`))
		return cell.attempts === 0
			? t('cellEmpty', { date })
			: t('cellActive', {
					date,
					attempts: cell.attempts,
					problems: cell.problems,
					solved: cell.solved
				})
	}

	// Today's cell is the one tab stop until the learner moves.
	const todayWeek = weekCount - 1
	const todayWeekday = grid.weeks[todayWeek]?.findLastIndex((cell) => cell != null) ?? 0
	const stop = focusAt ?? { week: todayWeek, weekday: todayWeekday }

	function move(week: number, weekday: number) {
		if (grid.weeks[week]?.[weekday] == null) return
		setFocusAt({ week, weekday })
		gridRef.current
			?.querySelector<HTMLElement>(`[data-week="${week}"][data-weekday="${weekday}"]`)
			?.focus()
	}

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>, week: number, weekday: number) {
		switch (event.key) {
			case 'ArrowRight':
				move(week + 1, weekday)
				break
			case 'ArrowLeft':
				move(week - 1, weekday)
				break
			case 'ArrowDown':
				move(week, weekday + 1)
				break
			case 'ArrowUp':
				move(week, weekday - 1)
				break
			case 'Home':
				move(
					grid.weeks.findIndex((column) => column[weekday] != null),
					weekday
				)
				break
			case 'End':
				move(
					grid.weeks.findLastIndex((column) => column[weekday] != null),
					weekday
				)
				break
			default:
				return
		}
		event.preventDefault()
	}

	const shown =
		shownDay == null ? null : (grid.weeks.flat().find((cell) => cell?.day === shownDay) ?? null)

	return (
		<div className={styles.root}>
			<div ref={scrollerRef} className={styles.scroller}>
				<div className={styles.frame}>
					<div className={styles.months} aria-hidden="true">
						{grid.weeks.map((_, week) => {
							const label = labelAt.get(week)
							return (
								<span key={week} className={styles.monthCell}>
									{label == null
										? null
										: monthFormat.format(new Date(Date.UTC(label.year, label.month, 1)))}
								</span>
							)
						})}
					</div>
					<div className={styles.body}>
						<div className={styles.weekdays} aria-hidden="true">
							{Array.from({ length: WEEKDAYS }, (_, row) => (
								<span key={row} className={styles.weekdayCell}>
									{LABELLED_ROWS.has(row)
										? weekdayFormat.format(new Date(SUNDAY_UTC + row * DAY_MS))
										: null}
								</span>
							))}
						</div>
						<div
							ref={gridRef}
							role="grid"
							className={styles.grid}
							aria-label={t('gridLabel')}
							aria-labelledby={headingId}
						>
							{Array.from({ length: WEEKDAYS }, (_, weekday) => (
								<div key={weekday} role="row" className={styles.row}>
									{grid.weeks.map((column, week) => {
										const cell = column[weekday]
										if (cell == null) {
											return <span key={week} role="gridcell" className={styles.blank} />
										}
										const label = describe(cell)
										return (
											<div
												key={week}
												role="gridcell"
												tabIndex={stop.week === week && stop.weekday === weekday ? 0 : -1}
												aria-label={label}
												data-week={week}
												data-weekday={weekday}
												data-level={cell.level}
												className={cn(styles.cell, cell.day === today && styles.today)}
												onKeyDown={(event) => onKeyDown(event, week, weekday)}
												onFocus={() => {
													setFocusAt({ week, weekday })
													setShownDay(cell.day)
												}}
												onBlur={() => setShownDay(null)}
												onMouseEnter={() => setShownDay(cell.day)}
												onMouseLeave={() => setShownDay(null)}
											/>
										)
									})}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
			<div className={styles.foot}>
				<p className={styles.detail} aria-live="polite">
					{shown != null
						? describe(shown)
						: t('summary', { attempts: grid.totalAttempts, days: grid.activeDays })}
				</p>
				<div className={styles.legend} aria-hidden="true">
					<span>{t('less')}</span>
					{[0, 1, 2, 3, 4].map((level) => (
						<span key={level} className={styles.legendCell} data-level={level} />
					))}
					<span>{t('more')}</span>
				</div>
			</div>
			{grid.activeDays === 0 ? <p className={styles.note}>{t('empty')}</p> : null}
			{showDisclaimer ? <p className={styles.note}>{t('disclaimer')}</p> : null}
		</div>
	)
}
