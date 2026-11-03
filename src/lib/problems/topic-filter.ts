// The Problems page's topic filter (specs/features/problems-page.md AC11): chips
// built from the topics the catalogue really has, and a plain filter over rows.
// Nothing is fetched; it only narrows rows the page already loaded.

export interface TaggedRow {
	tags: readonly string[]
}

// Every topic that appears on at least one row, in first-seen (catalogue) order.
export function topicsOf(rows: readonly TaggedRow[]): string[] {
	const seen = new Set<string>()
	for (const row of rows) for (const tag of row.tags) seen.add(tag)
	return [...seen]
}

// `null` means "all". A topic no row has yields nothing, never everything.
export function filterByTopic<T extends TaggedRow>(rows: readonly T[], topic: string | null): T[] {
	return topic == null ? [...rows] : rows.filter((row) => row.tags.includes(topic))
}
