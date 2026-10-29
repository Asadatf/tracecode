import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import robots from '@/app/robots'
import { llmsFullTxt, llmsTxt } from './llms'
import { PUBLIC_PAGES, pageCopy } from './pages'

// What docs/rules/seo.md makes mandatory, checked: a page either joins the
// sitemap and llms.txt through PUBLIC_PAGES and pageMetadata(), or says
// noindex. The lengths are the SEO platform's (content.title.length,
// content.description.length): what fits a result page without truncation.

const APP = 'src/app/[locale]'
const MESSAGES = 'messages'
const TITLE_CHARS = { min: 30, max: 60 }
const DESCRIPTION_CHARS = { min: 70, max: 160 }

function pageFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) return pageFiles(path)
		return entry.name === 'page.tsx' ? [path] : []
	})
}

// Route groups leave the URL; the [locale] segment is the prefix pageMetadata adds.
function routeOf(file: string): string {
	const segments = relative(APP, dirname(file))
		.split(sep)
		.filter((segment) => segment !== '' && !segment.startsWith('('))
	return `/${segments.join('/')}`
}

// The page, or a layout above it inside [locale], opts out of the index.
function optsOut(file: string): boolean {
	const sources = [file]
	for (let dir = dirname(file); dir.length >= APP.length; dir = dirname(dir)) {
		sources.push(join(dir, 'layout.tsx'))
	}
	return sources.some(
		(path) => existsSync(path) && /index:\s*false/.test(readFileSync(path, 'utf8'))
	)
}

test('every page is in PUBLIC_PAGES or opts out of the index, and every entry has a page', () => {
	// ponytail: a dynamic route (blog/[slug]) is skipped; give pageMetadata a
	// copy argument and the sitemap its URLs when the first one arrives.
	const files = pageFiles(APP).filter((file) => !routeOf(file).includes('['))
	assert.ok(files.length > 0, `no pages found under ${APP}`)
	const listed = new Set(PUBLIC_PAGES.map((page) => page.path))

	for (const file of files) {
		const route = routeOf(file)
		if (optsOut(file)) {
			assert.ok(!listed.has(route), `${route} is noindex but listed in PUBLIC_PAGES`)
			continue
		}
		assert.ok(
			listed.has(route),
			`${file} is indexable but has no PUBLIC_PAGES entry (src/lib/seo/pages.ts); add one, or give it robots: { index: false }`
		)
		assert.ok(
			readFileSync(file, 'utf8').includes(`pageMetadata({ path: '${route}'`),
			`${file} must export generateMetadata built with pageMetadata({ path: '${route}', locale })`
		)
	}

	const routes = new Set(files.map(routeOf))
	for (const page of PUBLIC_PAGES) {
		assert.ok(routes.has(page.path), `PUBLIC_PAGES lists ${page.path}, which has no page`)
	}
})

test('every public page has a title and description that fit the result page, in every locale', () => {
	const locales = readdirSync(MESSAGES).filter((name) => name.endsWith('.json'))
	assert.ok(locales.length > 0, `no messages found in ${MESSAGES}/`)

	for (const file of locales) {
		const messages = JSON.parse(readFileSync(join(MESSAGES, file), 'utf8'))
		for (const page of PUBLIC_PAGES) {
			const { title, description, body } = pageCopy(messages, page.messages)
			const where = `${file} ${page.messages}.meta`
			assert.ok(
				title.length >= TITLE_CHARS.min && title.length <= TITLE_CHARS.max,
				`${where}.title is ${title.length} characters; ${TITLE_CHARS.min}–${TITLE_CHARS.max} fits a result page`
			)
			assert.ok(
				description.length >= DESCRIPTION_CHARS.min && description.length <= DESCRIPTION_CHARS.max,
				`${where}.description is ${description.length} characters; ${DESCRIPTION_CHARS.min}–${DESCRIPTION_CHARS.max} fits a snippet`
			)
			assert.ok(
				!body.includes(title),
				`${where}.title repeats a string on the page; the title should not be a copy of the H1`
			)
		}
	}
})

test('every lastModified is a real date, not one in the future', () => {
	for (const page of PUBLIC_PAGES) {
		const date = new Date(`${page.lastModified}T00:00:00Z`)
		assert.match(
			page.lastModified,
			/^\d{4}-\d{2}-\d{2}$/,
			`${page.path}: lastModified is YYYY-MM-DD`
		)
		assert.ok(
			!Number.isNaN(date.getTime()) && date.getTime() <= Date.now(),
			`${page.path}: lastModified ${page.lastModified} is not a real past date`
		)
	}
})

test('llms.txt links every page and llms-full.txt carries its copy', () => {
	const pages = [
		{ url: 'https://example.com/', title: 'Acme', description: 'What Acme does', body: ['Hi'] },
		{
			url: 'https://example.com/pricing',
			title: 'Pricing',
			description: 'Plans',
			body: ['Free', 'Pro']
		}
	]
	const index = llmsTxt('Acme', pages)
	assert.match(index, /^# Acme\n\n> What Acme does\n\n## Pages\n/)
	assert.ok(index.includes('- [Pricing](https://example.com/pricing): Plans'))

	const full = llmsFullTxt('Acme', pages)
	for (const text of [
		'## Pricing',
		'Source: https://example.com/pricing',
		'Plans',
		'Free',
		'Pro'
	]) {
		assert.ok(full.includes(text), `llms-full.txt is missing "${text}"`)
	}
})

test('robots.txt opens production and closes everything else', () => {
	const saved = process.env.VERCEL_ENV
	try {
		process.env.VERCEL_ENV = 'production'
		const open = robots()
		assert.deepEqual(open.rules, { userAgent: '*', allow: '/', disallow: '/api/' })
		assert.match(String(open.sitemap), /\/sitemap\.xml$/)

		process.env.VERCEL_ENV = 'preview'
		assert.deepEqual(robots().rules, { userAgent: '*', disallow: '/' })
	} finally {
		if (saved === undefined) delete process.env.VERCEL_ENV
		else process.env.VERCEL_ENV = saved
	}
})
