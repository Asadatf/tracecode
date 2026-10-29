import { llmsTxt } from '@/lib/seo/llms'
import { llmsPages } from '@/lib/seo/metadata'
import { SITE, isIndexable } from '@/lib/seo/site'

// /llms.txt: the pages an answer engine should read (docs/rules/seo.md).
// Built at deploy time from PUBLIC_PAGES and their messages.
export const dynamic = 'force-static'

export async function GET() {
	if (!isIndexable()) return new Response('Not found', { status: 404 })
	return new Response(llmsTxt(SITE.name, await llmsPages()), {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	})
}
