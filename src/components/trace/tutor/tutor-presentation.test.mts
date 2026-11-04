// Fullscreen presentation contract (M8 final refinement #3).
//
// The maximized Tutor must constrain its conversation + composer to a
// comfortable width (~900–1000 px) and centre that content. The compact
// docked layout must stay unchanged. These invariants are testable
// without a DOM by reading the CSS module source and the panel source
// together.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), 'utf8')
}

const css = read('./tutor.module.css')
const panel = read('./tutor-panel.tsx')

describe('Tutor — fullscreen presentation', () => {
	it('panel toggles .panelMax only when maximized (compact layout untouched)', () => {
		assert.match(panel, /maximized && styles\.panelMax/)
		// A data attribute mirrors the state for ad-hoc selectors / testing.
		assert.match(panel, /data-maximized=\{maximized \? 'true' : 'false'\}/)
	})

	it('.panelMax caps content width and centres it horizontally', () => {
		// Max-width is in the comfortable 900–1000 px range.
		const widthMatch = css.match(/\.panelMax[^{]*\{[^}]*max-width:\s*(\d+)px/)
		assert.ok(widthMatch != null, 'max-width declared on a .panelMax rule')
		const width = Number(widthMatch[1])
		assert.ok(width >= 900 && width <= 1000, `max-width=${width} is in 900–1000`)
		// Centred via auto margins.
		assert.match(css, /\.panelMax[\s\S]*?margin-left:\s*auto/)
		assert.match(css, /\.panelMax[\s\S]*?margin-right:\s*auto/)
	})

	it('the rule that carries the width cap lists every fullscreen content block', () => {
		// Parse the real rule, not a loose regex: the selector list and the
		// declarations must live in the SAME block (a stray insertion once split them).
		const block = css.match(/(\.panelMax \.conversation[^{]*)\{([^}]*)\}/)
		assert.ok(block != null, 'fullscreen rule exists')
		const [, selectors, body] = block
		for (const name of ['conversation', 'composer', 'context', 'notice', 'errorBox', 'limitBox']) {
			assert.ok(selectors!.includes(`.panelMax .${name}`), `${name} is capped in fullscreen`)
		}
		assert.match(body!, /max-width:\s*960px/)
		assert.match(body!, /margin-left:\s*auto/)
		assert.match(body!, /margin-right:\s*auto/)
	})

	it('the compact .limitBox and .retryQuote carry no fullscreen width cap', () => {
		for (const name of ['limitBox', 'retryQuote']) {
			const own = [...css.matchAll(new RegExp(`(^|\\n)\\.${name} \\{([^}]*)\\}`, 'g'))]
			for (const m of own) assert.doesNotMatch(m[2]!, /max-width/, `.${name} must not cap width`)
		}
	})

	it('the width cap applies to the conversation AND the composer at minimum', () => {
		// The rule targets .conversation and .composer specifically — not
		// the whole .panel — so the pane's background still fills the
		// column and only the readable content is constrained.
		assert.match(css, /\.panelMax[\s\S]*?\.conversation/)
		assert.match(css, /\.panelMax[\s\S]*?\.composer/)
	})

	it('compact (non-maximized) panel has no .panelMax rule applied', () => {
		// Sanity: every max-width cap on .conversation / .composer sits
		// under a .panelMax selector. A rule that caps the compact panel
		// would narrow the docked layout too, which is out of scope.
		const regex = /(\.[\w.]+(?:\s*,\s*\.[\w.]+)*)\s*\{[^}]*max-width:\s*(?!100%)[^;]+;[^}]*\}/g
		let m: RegExpExecArray | null
		while ((m = regex.exec(css)) != null) {
			const selector = m[1]!
			if (/\.(conversation|composer)(?![\w-])/.test(selector)) {
				assert.ok(
					selector.includes('.panelMax'),
					`content max-width must be scoped to .panelMax, got: ${selector}`
				)
			}
		}
	})
})
