// The navigation curtain and brand wiring. The test runner cannot render React, so this
// pins the decisions by reading the sources — the ones that are easy to undo by accident.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../../../', import.meta.url).pathname
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name)
		return statSync(full).isDirectory() ? walk(full) : [full]
	})
}

describe('navigation curtain', () => {
	it('no route has a loading.tsx: it would replace the page being left with a second screen', () => {
		const loaders = walk(join(root, 'src/app')).filter((file) => /\/loading\.tsx$/.test(file))
		assert.deepEqual(loaders, [])
	})

	it('every link in the app goes through the curtain link', () => {
		const routing = read('src/i18n/routing.ts')
		assert.match(routing, /export \{ Link \} from '@\/components\/navigation\/curtain-link'/)
		const curtainLink = read('src/components/navigation/curtain-link.tsx')
		assert.match(curtainLink, /useLinkStatus/)
		assert.match(curtainLink, /useReportNavigationPending\(pending\)/)
		// next/link directly would skip the curtain and the locale handling.
		for (const file of walk(join(root, 'src/components'))) {
			if (!file.endsWith('.tsx') || file.endsWith('curtain-link.tsx')) continue
			assert.doesNotMatch(readFileSync(file, 'utf8'), /import Link from 'next\/link'/, file)
		}
	})

	it('the host lives in the root layout so it outlives the page it covers', () => {
		const layout = read('src/app/[locale]/layout.tsx')
		assert.match(layout, /<NavigationCurtainProvider>/)
	})

	it('never takes the pointer, never stays up for good, and honours reduced motion', () => {
		const css = read('src/components/navigation/navigation-curtain.module.css')
		assert.match(css, /pointer-events: none/)
		assert.match(css, /prefers-reduced-motion: reduce/)
		// Translucent: the previous page must read through it (0.65–0.8 alpha).
		for (const [, alpha] of css.matchAll(/rgba\([^)]*,\s*(0?\.\d+)\)/g)) {
			assert.ok(Number(alpha) >= 0.65 && Number(alpha) <= 0.8, `alpha ${alpha}`)
		}
		const code = read('src/components/navigation/navigation-curtain.tsx')
		assert.match(code, /MAX_VISIBLE_MS/)
		assert.match(code, /return \(\) => report\(false, tone\)/)
	})

	it('the page, not the OS, chooses the tone: landing and profile are dark', () => {
		const code = read('src/components/navigation/navigation-curtain.tsx')
		assert.doesNotMatch(code, /prefers-color-scheme|matchMedia/)
		assert.match(read('src/app/[locale]/page.tsx'), /<Surface tone="dark">/)
		assert.match(read('src/app/[locale]/u/[username]/page.tsx'), /<Surface tone="dark">/)
	})

	it('small operations keep their local loader and do not use the curtain', () => {
		for (const file of [
			'src/components/trace/practice-workspace.tsx',
			'src/components/challenge/challenge-exam.tsx',
			'src/components/trace/tutor/tutor-conversation.tsx'
		]) {
			const source = read(file)
			assert.match(source, /<TraceLoader/, file)
			assert.doesNotMatch(source, /useReportNavigationPending|NavigationCurtain/, file)
		}
	})
})

describe('brand icons', () => {
	const files = [
		'public/brand/tracecode-icon.svg',
		'public/brand/tracecode-icon-180.png',
		'public/brand/tracecode-icon-192.png',
		'public/brand/tracecode-icon-512.png'
	]

	it('the favicon, manifest and apple icon point at files that exist', () => {
		for (const file of files) assert.ok(existsSync(join(root, file)), file)
		const layout = read('src/app/[locale]/layout.tsx')
		const manifest = read('src/app/manifest.ts')
		for (const file of files) {
			const url = file.replace('public', '')
			assert.ok(layout.includes(url) || manifest.includes(url), `${url} is referenced`)
		}
		assert.match(manifest, /tracecode-icon-192\.png/)
		assert.match(manifest, /tracecode-icon-512\.png/)
		assert.match(layout, /apple: \[\{ url: '\/brand\/tracecode-icon-180\.png'/)
	})

	it('the placeholder "A" icons are gone', () => {
		assert.equal(existsSync(join(root, 'src/app/icon.svg')), false)
		assert.equal(existsSync(join(root, 'src/app/apple-icon.tsx')), false)
		assert.doesNotMatch(read('src/lib/seo/json-ld.tsx'), /\/icon\.svg/)
	})
})
