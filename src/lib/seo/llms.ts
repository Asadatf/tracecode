import type { PageCopy } from './pages'

// The two files answer engines look for at the origin root (llmstxt.org):
// llms.txt names the pages worth reading, llms-full.txt hands over their copy
// in one fetch. Google Search ignores both; ChatGPT, Perplexity and Claude's
// retrieval crawlers read them. Pure, so seo.test.mts pins the shape.

export interface LlmsPage extends PageCopy {
	/** Absolute URL of the page. */
	readonly url: string
}

function header(siteName: string, pages: readonly LlmsPage[]): string {
	// The home page's description doubles as the site summary.
	const summary = pages[0]?.description
	return [`# ${siteName}`, summary == null ? null : `> ${summary}`]
		.filter((line) => line != null)
		.join('\n\n')
}

export function llmsTxt(siteName: string, pages: readonly LlmsPage[]): string {
	const links = pages.map((page) => `- [${page.title}](${page.url}): ${page.description}`)
	return `${header(siteName, pages)}\n\n## Pages\n\n${links.join('\n')}\n`
}

export function llmsFullTxt(siteName: string, pages: readonly LlmsPage[]): string {
	const sections = pages.map((page) =>
		[`## ${page.title}`, `Source: ${page.url}`, page.description, ...page.body].join('\n\n')
	)
	return `${header(siteName, pages)}\n\n${sections.join('\n\n')}\n`
}
