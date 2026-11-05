// Structure, accessibility and copy contract for the public profile. No DOM runner,
// so (like the other a11y tests) this reads the sources and the messages.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTranslator } from 'next-intl'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const page = read('../../app/[locale]/u/[username]/page.tsx')
const body = read('./public-profile-body.tsx')
const copy = read('./copy-profile-link.tsx')
const skeleton = read('./profile-skeleton.tsx')
const css = read('./profile.module.css')
const messages = JSON.parse(read('../../../messages/en.json'))
const t = createTranslator({ locale: 'en', messages, namespace: 'PublicProfile' })

describe('public profile — structure and accessibility', () => {
	it('has one h1 (the username), labelled sections and a labelled brand link', () => {
		assert.equal((page.match(/<h1\b/g) ?? []).length, 1)
		assert.match(page, /aria-labelledby="profile-name"/)
		assert.match(body, /aria-labelledby="profile-activity"/)
		assert.match(body, /aria-labelledby="profile-topics"/)
		assert.match(page, /aria-label=\{t\('home'\)\}/)
		assert.match(page, /<main\b/)
	})

	it('shows the statistics as a description list, with decorative bars hidden', () => {
		assert.match(body, /<dl\b/)
		assert.ok((body.match(/<dt\b/g) ?? []).length === 4)
		assert.match(body, /aria-hidden="true"/)
	})

	it('reuses the M9A.2 heatmap rather than building another calendar', () => {
		assert.match(body, /from '@\/components\/activity\/activity-heatmap'/)
		assert.doesNotMatch(body, /role="grid"/)
	})

	it('has loading, empty, unavailable and not-found states', () => {
		assert.match(skeleton, /aria-busy="true"/)
		assert.match(skeleton, /role="status"/)
		assert.match(body, /stats\.empty/)
		assert.match(body, /result\.status === 'unavailable'/)
		assert.match(page, /notFound\(\)/)
	})

	it('the skeleton reserves the same space as the content (no layout shift)', () => {
		assert.match(css, /\.skStat\s*\{\s*min-height: 92px/)
		assert.match(css, /\.stat\s*\{[^}]*min-height: 92px/)
		assert.match(css, /\.skGraph/)
	})

	it('copy announces its result and keeps the address selectable as text', () => {
		assert.match(copy, /role="status"/)
		assert.match(copy, /aria-live="polite"/)
		assert.match(copy, /navigator\.clipboard\.writeText/)
		assert.match(copy, /catch/)
	})

	it('is responsive: stats reflow, long names wrap, nothing forces sideways scroll', () => {
		assert.match(css, /@media \(max-width: 720px\)/)
		assert.match(css, /overflow-wrap: anywhere/)
		assert.match(css, /minmax\(0, 1fr\)/)
	})

	it('uses design tokens and respects reduced motion', () => {
		assert.match(css, /var\(--accent\)/)
		assert.match(css, /var\(--surface\)/)
		assert.match(css, /prefers-reduced-motion/)
		assert.match(css, /:focus-visible/)
	})
})

describe('public profile — copy', () => {
	it('the share description states only real numbers', () => {
		assert.equal(
			t('meta.description', { username: 'alice', solved: 3, longest: 4 }),
			'alice has solved 3 problems on TraceCode, with a longest practice streak of 4 days.'
		)
		assert.equal(
			t('meta.description', { username: 'alice', solved: 1, longest: 1 }),
			'alice has solved 1 problem on TraceCode, with a longest practice streak of 1 day.'
		)
		assert.equal(
			t('meta.descriptionBasic', { username: 'alice' }),
			"alice's learning profile on TraceCode: practice activity and topics practised."
		)
	})

	it('every message the page and components use exists', () => {
		const has = (path: string) =>
			path
				.split('.')
				.reduce<unknown>(
					(node, part) =>
						typeof node === 'object' && node !== null
							? (node as Record<string, unknown>)[part]
							: undefined,
					messages.PublicProfile
				) !== undefined
		const keys = [page, body, copy].flatMap((source) =>
			[...source.matchAll(/\bt\('([A-Za-z.]+)'/g)].map((m) => m[1] ?? '')
		)
		assert.ok(keys.length >= 15)
		// A component reads through its own namespace: the page also uses `meta`, the
		// copy button `share`.
		for (const key of keys) {
			assert.ok(has(key) || has(`meta.${key}`) || has(`share.${key}`), key)
		}
	})

	it('says it is recorded practice, not a verified assessment', () => {
		const note = String(messages.PublicProfile.footnote)
		assert.ok(note.includes('not a verified skill assessment'))
	})

	it('empty profile text names the learner and invents nothing', () => {
		assert.equal(t('empty', { username: 'alice' }), "alice hasn't recorded any practice yet.")
	})
})
