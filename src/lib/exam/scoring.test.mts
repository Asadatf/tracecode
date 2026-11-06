import test from 'node:test'
import assert from 'node:assert/strict'
import { SCORE_MAX, codingScore, finalScore, rankStandings, type StandingInput } from './scoring.ts'

// specs/features/daily-exam.md AC18, AC19, AC29.

test('AC18: correctness 0–8000, speed only on a full pass, 10,000 max', () => {
	assert.deepEqual(codingScore({ testsPassed: 13, testsTotal: 13, elapsedSeconds: 0 }), {
		correctness: 8000,
		speed: 2000,
		coding: 10000,
		fullPass: true
	})
	assert.equal(SCORE_MAX, 10000)
	// Half the window used: half the speed points.
	assert.equal(codingScore({ testsPassed: 13, testsTotal: 13, elapsedSeconds: 900 }).speed, 1000)
	// Submitted at the deadline (an auto submission): no speed points.
	assert.equal(codingScore({ testsPassed: 13, testsTotal: 13, elapsedSeconds: 1800 }).speed, 0)
	// A partial pass never gets speed points, however fast.
	assert.deepEqual(codingScore({ testsPassed: 5, testsTotal: 13, elapsedSeconds: 10 }), {
		correctness: 3076,
		speed: 0,
		coding: 3076,
		fullPass: false
	})
})

test('AC18: integer floors are exact and inputs are clamped', () => {
	assert.equal(codingScore({ testsPassed: 1, testsTotal: 3, elapsedSeconds: 0 }).correctness, 2666)
	assert.equal(codingScore({ testsPassed: 13, testsTotal: 13, elapsedSeconds: 1 }).speed, 1998)
	assert.equal(
		codingScore({ testsPassed: 99, testsTotal: 13, elapsedSeconds: 0 }).correctness,
		8000
	)
	assert.equal(codingScore({ testsPassed: 0, testsTotal: 0, elapsedSeconds: 0 }).coding, 0)
	assert.equal(codingScore({ testsPassed: 13, testsTotal: 13, elapsedSeconds: -5 }).speed, 2000)
})

test('final score subtracts deductions and never goes below zero', () => {
	assert.equal(finalScore(9000, 2000), 7000)
	assert.equal(finalScore(1000, 2000), 0)
	assert.equal(finalScore(1000, -50), 1000)
})

const s = (
	userKey: string,
	status: StandingInput['status'],
	score: number,
	passed: number,
	at: number | null
): StandingInput => ({ userKey, status, finalScore: score, testsPassed: passed, submittedAtMs: at })

test('AC19: full pass first, then score, then tests passed, then earlier submission', () => {
	const out = rankStandings('2026-11-20', [
		s('partial-high', 'partial', 7500, 12, 1),
		s('full-low', 'full_pass', 8000, 13, 50),
		s('full-high', 'full_pass', 9500, 13, 90),
		s('partial-early', 'partial', 6000, 10, 10),
		s('partial-late', 'partial', 6000, 10, 20),
		s('none', 'no_submission', 0, 0, null)
	])
	assert.deepEqual(
		out.map((r) => [r.entry.userKey, r.rank]),
		[
			['full-high', 1],
			['full-low', 2],
			['partial-high', 3],
			['partial-early', 4],
			['partial-late', 5],
			['none', 6]
		]
	)
})

test('AC19: exact ties share a rank; the next rank skips', () => {
	const out = rankStandings('2026-11-20', [
		s('a', 'full_pass', 9000, 13, 100),
		s('b', 'full_pass', 9000, 13, 100),
		s('c', 'partial', 100, 1, 5)
	])
	const rankOf = (k: string) => out.find((r) => r.entry.userKey === k)?.rank
	assert.equal(rankOf('a'), 1)
	assert.equal(rankOf('b'), 1)
	assert.equal(rankOf('c'), 3)
})

test('AC19: grading_failed is listed but never ranked or scored into the ranking', () => {
	const out = rankStandings('2026-11-20', [
		s('failed', 'grading_failed', 0, 0, 1),
		s('ok', 'partial', 100, 1, 2)
	])
	assert.deepEqual(
		out.map((r) => [r.entry.userKey, r.ranked, r.rank]),
		[
			['ok', true, 1],
			['failed', false, null]
		]
	)
})

test('ordering is deterministic whatever the input order', () => {
	const entries = [
		s('x', 'full_pass', 9000, 13, 100),
		s('y', 'full_pass', 9000, 13, 100),
		s('z', 'full_pass', 9000, 13, 100)
	]
	const a = rankStandings('2026-11-20', entries).map((r) => r.entry.userKey)
	const b = rankStandings('2026-11-20', [...entries].reverse()).map((r) => r.entry.userKey)
	assert.deepEqual(a, b)
})
