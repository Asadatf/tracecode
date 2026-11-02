// "12 min. ago", "yesterday": the age of a notification for the bell's list.
// Intl does the wording and the locale; this only picks the unit.

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function relativeTime(iso: string, now: Date = new Date(), locale?: string): string {
	const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
	const age = Math.abs(seconds)
	const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
	if (age < MINUTE) return format.format(0, 'second')
	if (age < HOUR) return format.format(Math.round(seconds / MINUTE), 'minute')
	if (age < DAY) return format.format(Math.round(seconds / HOUR), 'hour')
	return format.format(Math.round(seconds / DAY), 'day')
}
