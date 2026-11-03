import test from 'node:test'
import assert from 'node:assert/strict'
import {
	DEFAULT_LAYOUT,
	clampLeft,
	clampTop,
	clampTutor,
	leftLimits,
	tutorLimits,
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
	const saved = {
		left: 41.26,
		top: 52,
		leftCollapsed: true,
		resultsCollapsed: false,
		codeCollapsed: true,
		tutor: 31.84
	}
	assert.deepEqual(parseLayoutCookie(layoutCookieValue(saved)), {
		...saved,
		left: 41.3,
		tutor: 31.8
	})
	assert.deepEqual(parseLayoutCookie(undefined), DEFAULT_LAYOUT)
	assert.deepEqual(parseLayoutCookie('nope'), DEFAULT_LAYOUT)
	assert.equal(parseLayoutCookie('999,1,0,0').left, 60)
})

test('AC17: the Tutor column keeps 300px, at most 45%, and the middle keeps 420px', () => {
	// 1440px wide, challenge at 20%: 300px is 20.9%, room for the middle caps it at 45%.
	assert.equal(clampTutor(5, 1440, 20, false), 20.9)
	assert.equal(clampTutor(80, 1440, 20, false), 45)
	// A wide challenge pane leaves less: 1440 − 40% − (420+20)/1440 ≈ 29.4%.
	assert.equal(tutorLimits(1440, 40, false).max, 29.4)
	// A collapsed challenge rail takes only 44px.
	assert.ok(tutorLimits(1440, 40, true).max > tutorLimits(1440, 40, false).max)
})

test('AC17: with the Tutor open the challenge pane gives up room to the middle', () => {
	assert.equal(leftLimits(1440).max, 60)
	assert.equal(clampLeft(60, 1440, 28), leftLimits(1440, 28).max)
	assert.ok(leftLimits(1440, 28).max < 60)
	// The range is never inverted, even in a window too small for all three.
	const tight = leftLimits(900, 28)
	assert.ok(tight.max >= tight.min)
	const tightTutor = tutorLimits(900, 20, false)
	assert.ok(tightTutor.max >= tightTutor.min)
})

test('AC7: a cookie saved before the Tutor existed still loads', () => {
	const old = parseLayoutCookie('36,58,0,0')
	assert.equal(old.tutor, DEFAULT_LAYOUT.tutor)
	assert.equal(old.left, 36)
})

test('AC6: the code pane can be folded up, but never together with the results', () => {
	assert.equal(parseLayoutCookie('36,58,0,0,28,1').codeCollapsed, true)
	const both = parseLayoutCookie('36,58,0,1,28,1')
	assert.equal(both.codeCollapsed, true)
	assert.equal(both.resultsCollapsed, false)
	assert.equal(parseLayoutCookie('36,58,0,0').codeCollapsed, false)
})
