import { llmsFullTxt } from '@/lib/seo/llms'
import { llmsPages } from '@/lib/seo/metadata'
import { SITE, isIndexable } from '@/lib/seo/site'

// /llms-full.txt: the same pages as llms.txt with their copy, in one fetch.
export const dynamic = 'force-static'

export async function GET() {
	if (!isIndexable()) return new Response('Not found', { status: 404 })
	return new Response(llmsFullTxt(SITE.name, await llmsPages()), {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	})
}
