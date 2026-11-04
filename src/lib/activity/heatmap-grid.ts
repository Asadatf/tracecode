import { addDays } from '../streak/streak'
import type { DailyActivity } from './daily-activity'

// The contribution graph's layout (specs/features/activity-heatmap.md). Pure, UTC
// only, so it agrees with the streak and the calendars. Columns are weeks (Sunday
// first, like the app's other calendars), rows are weekdays.

export const HEATMAP_SPAN_DAYS = 365
export const WEEKDAYS = 7

export type ActivityLevel = 0 | 1 | 2 | 3 | 4

// Fixed thresholds, not relative to the learner's own busiest day, so the same
// amount of practice always looks the same and two profiles are comparable:
// 0 = none, 1 = one run, 2 = 2-3, 3 = 4-6, 4 = 7 or more.
export function activityLevel(attempts: number): ActivityLevel {
	if (!(attempts > 0)) return 0
	if (attempts === 1) return 1
	if (attempts <= 3) return 2
	if (attempts <= 6) return 3
	return 4
}

export interface HeatmapCell {
	day: string
	attempts: number
	problems: number
	solved: number
	level: ActivityLevel
}

export interface MonthLabel {
	// Index of the week column the label sits over.
	week: number
	year: number
	// 0-based month.
	month: number
}

export interface HeatmapGrid {
	// weeks[w][d]: d is 0 (Sunday) to 6 (Saturday). null = outside the range
	// (before the window starts or after today).
	weeks: (HeatmapCell | null)[][]
	monthLabels: MonthLabel[]
	// Over the cells shown.
	totalAttempts: number
	activeDays: number
	from: string
	to: string
}

const DAY_MS = 86_400_000

function dayNumber(iso: string): number {
	return Math.floor(Date.parse(`${iso}T00:00:00.000Z`) / DAY_MS)
}

// 0 (Sunday) to 6 (Saturday).
function weekday(iso: string): number {
	return new Date(`${iso}T00:00:00.000Z`).getUTCDay()
}

// The graph for the 365 days ending `today` (inclusive), padded back to a Sunday.
export function buildHeatmapGrid(days: readonly DailyActivity[], today: string): HeatmapGrid {
	const byDay = new Map(days.map((entry) => [entry.day, entry]))
	const windowStart = addDays(today, -(HEATMAP_SPAN_DAYS - 1))
	const gridStart = addDays(windowStart, -weekday(windowStart))
	const totalDays = dayNumber(today) - dayNumber(gridStart) + 1
	const weekCount = Math.ceil(totalDays / WEEKDAYS)

	const weeks: (HeatmapCell | null)[][] = []
	const monthLabels: MonthLabel[] = []
	let totalAttempts = 0
	let activeDays = 0
	for (let w = 0; w < weekCount; w++) {
		const column: (HeatmapCell | null)[] = []
		let firstOfMonth: MonthLabel | null = null
		for (let d = 0; d < WEEKDAYS; d++) {
			const day = addDays(gridStart, w * WEEKDAYS + d)
			if (day < windowStart || day > today) {
				column.push(null)
				continue
			}
			const entry = byDay.get(day)
			const attempts = entry?.attempts ?? 0
			column.push({
				day,
				attempts,
				problems: entry?.problems ?? 0,
				solved: entry?.solved ?? 0,
				level: activityLevel(attempts)
			})
			totalAttempts += attempts
			if (attempts > 0) activeDays += 1
			if (day.endsWith('-01')) {
				firstOfMonth = {
					week: w,
					year: Number(day.slice(0, 4)),
					month: Number(day.slice(5, 7)) - 1
				}
			}
		}
		weeks.push(column)
		if (firstOfMonth != null) monthLabels.push(firstOfMonth)
	}

	// The first column has no "1st" in it unless the window starts there; label its
	// month too, but only when the next label is far enough away not to collide.
	const firstCell = weeks[0]?.find((cell) => cell != null)
	if (firstCell != null && monthLabels[0]?.week !== 0) {
		const nextWeek = monthLabels[0]?.week ?? weekCount
		if (nextWeek >= 3) {
			monthLabels.unshift({
				week: 0,
				year: Number(firstCell.day.slice(0, 4)),
				month: Number(firstCell.day.slice(5, 7)) - 1
			})
		}
	}
	return { weeks, monthLabels, totalAttempts, activeDays, from: windowStart, to: today }
}
