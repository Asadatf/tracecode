// Every public page, one entry each. The sitemap, llms.txt and llms-full.txt
// are built from this list, and a page's title and description come from its
// messages namespace through pageMetadata(). seo.test.mts fails on a page file
// with no entry and on an entry with no page (docs/rules/seo.md).

export interface PublicPage {
	/** The path without a locale prefix: '/', '/pricing'. */
	readonly path: string
	/**
	 * The messages namespace holding the page's copy. Its `meta.title` and
	 * `meta.description` are the search result; every other string in it is
	 * the page's text, which llms-full.txt hands to answer engines.
	 */
	readonly messages: string
	/** When the page's content last changed, YYYY-MM-DD. Move it with the copy, or the sitemap lies. */
	readonly lastModified: string
}

export const PUBLIC_PAGES: readonly PublicPage[] = [
	{ path: '/', messages: 'HomePage', lastModified: '2026-10-18' }
]

export function publicPage(path: string): PublicPage {
	const page = PUBLIC_PAGES.find((entry) => entry.path === path)
	if (page == null) throw new Error(`No PUBLIC_PAGES entry for ${path} (src/lib/seo/pages.ts)`)
	return page
}

export interface PageCopy {
	readonly title: string
	readonly description: string
	/** Every other string in the namespace, in order. */
	readonly body: readonly string[]
}

type Messages = Record<string, unknown>

function strings(value: unknown): string[] {
	if (typeof value === 'string') return [value]
	if (value != null && typeof value === 'object') return Object.values(value).flatMap(strings)
	return []
}

// ponytail: ICU placeholders ({count}, {name}) come through as written; format
// them here once a page's copy carries any.
export function pageCopy(messages: Messages, namespace: string): PageCopy {
	const copy = messages[namespace]
	if (copy == null || typeof copy !== 'object') {
		throw new Error(`messages has no ${namespace} namespace`)
	}
	const { meta, ...rest } = copy as Messages
	const { title, description } = (meta ?? {}) as Messages
	if (typeof title !== 'string' || typeof description !== 'string') {
		throw new Error(`${namespace}.meta needs a title and a description`)
	}
	return { title, description, body: strings(rest) }
}
