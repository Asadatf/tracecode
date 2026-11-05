// Structure, honesty and accessibility contract for the challenge UI. No DOM runner, so
// (like the other a11y tests) this reads the sources and the messages.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTranslator } from 'next-intl'

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(new URL(p, import.meta.url), 'utf8'))
const exam = read('./challenge-exam.tsx')
const examPage = read('../../app/[locale]/challenge/[date]/page.tsx')
const board = read('../../app/[locale]/leaderboard/page.tsx')
const optIn = read('../settings/leaderboard-opt-in.tsx')
const calendar = read('../problems/problem-calendar.tsx')
const messages = JSON.parse(
	readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8')
)
const t = (ns: string) => createTranslator({ locale: 'en', messages, namespace: ns })

describe('the assessment shows no teaching aids', () => {
	it('imports nothing from Tracy, hints, replay, solutions or the practice workspace', () => {
		for (const source of [exam, examPage]) {
			assert.doesNotMatch(
				source,
				/tutor|Tracy|use-tutor|hint|replay|reference-solutions|practice-workspace|optimization|knownStrategies|correctnessHints/i
			)
		}
	})

	it('shows only what the exam needs: statement, examples, editor, timer, Run, Submit', () => {
		for (const needle of [
			'problem.statement',
			'problem.examples',
			'<CodeEditor',
			'role="timer"',
			"t('run')",
			"t('submit')",
			"t('start')"
		])
			assert.ok(exam.includes(needle), needle)
	})

	it('explains the one-submission rule before the learner can start', () => {
		const rules = exam.indexOf("t('rules.heading')")
		const start = exam.indexOf("t('start')")
		assert.ok(rules > 0 && rules < start)
		assert.ok(exam.includes("t('rules.once')"))
	})
})

describe('the server owns the clock and the score', () => {
	it('the countdown is display only: only a date and the source ever go to the server', () => {
		assert.match(exam, /submitChallengeAction\(\{ date, source: code \}\)/)
		assert.match(exam, /startChallengeAction\(\{ date \}\)/)
		assert.match(exam, /challengeStatusAction\(\{ date \}\)/)
		// Every server-action call carries only the date (and, for Submit, the source).
		const calls = [...exam.matchAll(/(start|submit|status)\w*Action\(\{([^}]*)\}\)/gi)].map(
			(m) => m[2] ?? ''
		)
		assert.equal(calls.length, 3)
		for (const args of calls) assert.match(args, /^\s*date(, source: code)?\s*$/)
	})

	it('local Run uses public examples only and never reaches a server action', () => {
		assert.match(exam, /runCode\(exampleRunRequest\(problem, code\)\)/)
		const runFn = exam.slice(exam.indexOf('async function run()'), exam.indexOf('const examples'))
		assert.doesNotMatch(runFn, /Action\(/)
	})

	it('the display clock is anchored to the server\'s "now", not just the browser\'s', () => {
		assert.match(exam, /Date\.parse\(serverNow\) - Date\.now\(\)/)
	})

	it('the exam page passes the browser a problem without tests, and the server-only grader state as a boolean', () => {
		assert.match(examPage, /toExamProblem\(problem\)/)
		assert.match(examPage, /scoringActive=\{grader != null\}/)
	})

	it('the exam does not poll for a score when grading is off', () => {
		assert.match(exam, /if \(!scoringActive\) return/)
	})
})

describe('states and accessibility', () => {
	it('covers not started, running, submitting, awaiting grading, graded, grader error, expired and error', () => {
		for (const needle of [
			'phase == null',
			"phase === 'running'",
			"phase === 'submitted'",
			"phase === 'graded'",
			"phase === 'grader_error'",
			"phase === 'expired'",
			"busy === 'submitting'",
			'role="alert"'
		])
			assert.ok(exam.includes(needle), needle)
	})

	it('announces status changes and labels the timer and editor', () => {
		assert.match(exam, /aria-live="polite"/)
		assert.match(exam, /aria-label=\{t\('timeLeftLabel'\)\}/)
		assert.match(exam, /ariaLabel=\{t\('editor'\)\}/)
	})

	it('final submission is a two-step confirm', () => {
		assert.match(exam, /setConfirming\(true\)/)
		assert.match(exam, /t\('confirmSubmit'\)/)
	})

	it('the future is a 404, a past day is practice only, and the page needs a signed-in learner', () => {
		assert.match(
			examPage,
			/lookup\.status === 'locked'[\s\S]*?lookup\.status === 'before_launch'[\s\S]*?notFound\(\)/
		)
		assert.match(examPage, /lookup\.kind === 'past'/)
		assert.match(examPage, /currentAccountSafe\(\)/)
		assert.match(examPage, /robots: \{ index: false/)
	})
})

describe('the calendar and the leaderboard', () => {
	it('the calendar never links a future date and reads assignments from the pinned map', () => {
		assert.match(calendar, /if \(iso > todayIso\)/)
		assert.match(calendar, /if \(iso < CHALLENGE_EPOCH\)/)
		assert.match(calendar, /aria-disabled="true"/)
		assert.match(calendar, /const slug = pinned\[iso\]/)
		assert.doesNotMatch(calendar, /problemForDate/)
	})

	it('the leaderboard is a labelled table with row headers, rules, honest empty and pending states', () => {
		for (const needle of [
			'<caption',
			'scope="col"',
			'scope="row"',
			"t('rules.heading')",
			"t('empty')",
			"t('gradingOff')",
			"t('unavailable')",
			'role="status"'
		])
			assert.ok(board.includes(needle), needle)
	})

	it('the leaderboard page selects and shows no email, id or source', () => {
		assert.doesNotMatch(board, /email|userId|source/i)
	})

	it('the opt-in is off by default, explicit, and says it is separate from the public profile', () => {
		assert.match(optIn, /checked=\{optIn\}/)
		assert.match(optIn, /setLeaderboardOptInAction\(\{ optIn: wanted \}\)/)
		assert.doesNotMatch(optIn, /userId/)
		assert.match(String(messages.SettingsPage.leaderboard.help), /does not do this by itself/)
		assert.match(String(messages.SettingsPage.leaderboard.help), /Off unless you turn it on/)
	})
})

describe('copy', () => {
	function keys(source: string): string[] {
		// A key ending in '.' is a template literal prefix (checked separately below).
		return [...source.matchAll(/\bt\(\s*['`]([A-Za-z0-9.]+)/g)]
			.map((m) => m[1] ?? '')
			.filter((k) => !k.endsWith('.'))
	}
	function has(ns: string, key: string): boolean {
		return (
			key.split('.').reduce<unknown>(
				(node, part) =>
					typeof node === 'object' && node !== null
						? (node as Record<string, unknown>)[part]
						: undefined,
				ns.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], messages)
			) !== undefined
		)
	}

	it('every message the exam, the pages and the opt-in use exists', () => {
		for (const key of keys(exam)) assert.ok(has('Challenge', key), `Challenge.${key}`)
		for (const key of keys(examPage)) assert.ok(has('Challenge', key), `Challenge.${key}`)
		for (const key of keys(board)) assert.ok(has('Leaderboard', key), `Leaderboard.${key}`)
		for (const key of keys(optIn))
			assert.ok(has('SettingsPage.leaderboard', key), `SettingsPage.leaderboard.${key}`)
		for (const key of [
			'errors.generic',
			'errors.unauthenticated',
			'errors.notLive',
			'errors.notStarted',
			'errors.empty',
			'errors.tooLarge'
		])
			assert.ok(has('Challenge', key), key)
		for (const key of ['status.saved', 'status.username_required', 'status.failed'])
			assert.ok(has('SettingsPage.leaderboard', key), key)
	})

	it('rules and results read correctly with real values', () => {
		const c = t('Challenge')
		assert.match(c('rules.time', { minutes: 30 }), /30 minutes/)
		assert.equal(c('graded', { passed: 11, total: 12 }), '11 of 12 hidden tests passed.')
		assert.equal(c('exampleResult', { passed: 2, total: 2 }), 'Public examples passed: 2 of 2')
		const l = t('Leaderboard')
		assert.equal(l('top', { count: 20 }), 'Top 20')
		assert.equal(l('you.rank', { rank: 4, competitors: 31 }), 'Your rank: 4 of 31.')
		assert.equal(l('competitors', { count: 1 }), '1 opted-in learner has a verified result.')
		assert.equal(l('competitors', { count: 0 }), 'No opted-in learners have a verified result.')
	})

	it('makes no claim of proctoring, cheating detection or an unverified ranking', () => {
		const text = JSON.stringify([messages.Challenge, messages.Leaderboard]).toLowerCase()
		for (const word of ['cheat', 'proctor', 'monitor', 'camera', 'surveillance', 'detect'])
			assert.equal(text.includes(word), false, word)
		assert.match(
			String(messages.Leaderboard.rules.verified),
			/Results reported by a browser are never used/
		)
	})
})
