// The month layout shared by every calendar in the app (the Problems calendar and
// the streak popover). Pure: UTC days only, so it matches the daily problem and
// the streak. Months are 0-based like Date.

export interface MonthView {
	year: number
	month: number
}

// 6 week rows x 7 days, so a calendar is the same height every month.
export const GRID_CELLS = 42

const WEEKDAY_SUNDAY = Date.UTC(2023, 0, 1)
const DAY_MS = 86_400_000

export function monthOf(iso: string): MonthView {
	const [year = 1970, month = 1] = iso.split('-').map(Number)
	return { year, month: month - 1 }
}

export function shiftMonth({ year, month }: MonthView, by: number): MonthView {
	const next = new Date(Date.UTC(year, month + by, 1))
	return { year: next.getUTCFullYear(), month: next.getUTCMonth() }
}

export function dayIso(view: MonthView, day: number): string {
	return new Date(Date.UTC(view.year, view.month, day)).toISOString().slice(0, 10)
}

export function monthLayout(view: MonthView, locale: string) {
	const first = new Date(Date.UTC(view.year, view.month, 1))
	const leading = first.getUTCDay()
	const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate()
	return {
		leading,
		daysInMonth,
		trailing: Math.max(0, GRID_CELLS - leading - daysInMonth),
		title: new Intl.DateTimeFormat(locale, {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(first),
		short: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
			.format(first)
			.toLocaleUpperCase(locale),
		weekdays: Array.from({ length: 7 }, (_, index) =>
			new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
				new Date(WEEKDAY_SUNDAY + index * DAY_MS)
			)
		)
	}
}
