// The problems page's calendar (specs/features/problems-page.md AC8–AC10): every
// date points at one problem. It looks random but is a pure function of the
// date, so a given date always opens the same problem for everyone, with no
// storage and no clock beyond the date itself.

// FNV-1a over the ISO date, then modulo the catalogue size.
export function problemForDate(slugs: readonly string[], isoDate: string): string | undefined {
	if (slugs.length === 0) return undefined
	let hash = 0x811c9dc5
	for (const char of isoDate) {
		hash ^= char.charCodeAt(0)
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return slugs[hash % slugs.length]
}

// 'YYYY-MM-DD' for a UTC calendar day (month is 0-based, like Date).
export function isoDate(year: number, month: number, day: number): string {
	return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}
