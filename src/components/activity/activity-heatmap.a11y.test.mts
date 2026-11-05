// The graph's accessibility and honesty contract. The test runner has no DOM, so
// (like markdown-view.a11y.test.mts) this reads the component source and pins the
// wiring, so an edit that drops a role, a label or the unavailable state fails here.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./activity-heatmap.tsx', import.meta.url), 'utf8')
const slot = readFileSync(new URL('./activity-heatmap-slot.tsx', import.meta.url), 'utf8')
const skeleton = readFileSync(new URL('./activity-heatmap-skeleton.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./activity.module.css', import.meta.url), 'utf8')

describe('ActivityHeatmap — accessibility contract', () => {
	it('is a labelled grid of rows and gridcells with one tab stop', () => {
		assert.match(src, /role="grid"/)
		assert.match(src, /role="row"/)
		assert.match(src, /role="gridcell"/)
		assert.match(src, /aria-label=\{t\('gridLabel'\)\}/)
		assert.match(src, /tabIndex=\{stop\.week === week && stop\.weekday === weekday \? 0 : -1\}/)
	})

	it('every day cell has a full text label and the detail is not tooltip-only', () => {
		assert.match(src, /aria-label=\{label\}/)
		assert.match(src, /aria-live="polite"/)
	})

	it('moves with the arrow keys, Home and End', () => {
		for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
			assert.ok(src.includes(`'${key}'`), key)
		}
	})

	it('decorative labels and the legend are hidden from assistive tech', () => {
		assert.ok((src.match(/aria-hidden="true"/g) ?? []).length >= 3)
	})

	it('says it is practice activity, not skill, and has an honest unavailable state', () => {
		assert.match(src, /t\('disclaimer'\)/)
		assert.match(src, /days == null/)
		assert.match(src, /t\('unavailable'\)/)
		assert.match(src, /t\('empty'\)/)
	})

	it('shows a loading state that never reads as "no practice"', () => {
		assert.match(skeleton, /aria-busy="true"/)
		assert.match(skeleton, /role="status"/)
	})

	it('only a signed-in learner gets the card, and it reads the shared activity query', () => {
		assert.match(slot, /!activity\.authenticated\) return null/)
		assert.match(slot, /getActivitySummary/)
	})

	it('uses design tokens, keeps focus visible, and respects reduced motion', () => {
		assert.match(css, /var\(--accent\)/)
		assert.match(css, /:focus-visible/)
		assert.match(css, /prefers-reduced-motion/)
		assert.match(css, /overflow-x: auto/)
		assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'no hard-coded colours')
	})
})
