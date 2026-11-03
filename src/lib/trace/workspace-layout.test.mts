import test from 'node:test'
import assert from 'node:assert/strict'
import {
	DEFAULT_LAYOUT,
	clampLeft,
	clampTop,
	layoutCookieValue,
	parseLayoutCookie,
	stepPercent
} from './workspace-layout.ts'

test('AC4: the challenge pane never goes below 280px or outside 20–60%', () => {
	assert.equal(clampLeft(5, 1400), 20)
	assert.equal(clampLeft(90, 1400), 60)
	assert.equal(clampLeft(40, 1400), 40)
	// 280px of a 1000px workspace is 28%, above the 20% floor.
	assert.equal(clampLeft(10, 1000), 28)
})

test('AC4: the code pane keeps 180px and the results pane 120px', () => {
	// right column 600px: min code 30% (=180px), max = 100 − 20% = 75% capped at 75
	assert.equal(clampTop(10, 600), 30)
	assert.equal(clampTop(95, 600), 75)
	// right column 400px: min code 45% (=180px), max 70% (leaves 120px)
	assert.equal(clampTop(10, 400), 45)
	assert.equal(clampTop(95, 400), 70)
})

test('AC4: a window too small for both minimums still yields a valid range', () => {
	const top = clampTop(50, 250)
	assert.ok(Number.isFinite(top))
})

test('AC5: keyboard steps are pixels as a percent of the container', () => {
	assert.equal(stepPercent(16, 1600), 1)
	assert.equal(stepPercent(64, 640), 10)
})

test('AC7: the layout cookie round-trips and ignores garbage', () => {
	const saved = { left: 41.26, top: 52, leftCollapsed: true, resultsCollapsed: false }
	assert.deepEqual(parseLayoutCookie(layoutCookieValue(saved)), { ...saved, left: 41.3 })
	assert.deepEqual(parseLayoutCookie(undefined), DEFAULT_LAYOUT)
	assert.deepEqual(parseLayoutCookie('nope'), DEFAULT_LAYOUT)
	assert.equal(parseLayoutCookie('999,1,0,0').left, 60)
})
