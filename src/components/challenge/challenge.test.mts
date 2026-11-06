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

describe('no teaching aids and no competition appear on the challenge', () => {
	it('imports nothing from Tracy, hints, replay, solutions or the practice workspace', () => {
		for (const source of [exam, examPage]) {
			assert.doesNotMatch(
				source,
				/tutor|Tracy|use-tutor|hint|replay|reference-solutions|practice-workspace|optimization|knownStrategies|correctnessHints/i
			)
		}
	})

	it('shows only what the challenge needs: statement, examples, editor, timer, Run, Submit, Start', () => {
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

	it('shows no score, rank, leaderboard link or deadline; the result is counts only', () => {
		assert.doesNotMatch(exam, /leaderboard|rank|score|deadline|expired/i)
		assert.doesNotMatch(examPage, /leaderboard/i)
		const text = JSON.stringify(messages.Challenge).toLowerCase()
		for (const word of ['leaderboard', 'ranked against', 'expired', 'proctor', 'score:'])
			assert.equal(text.includes(word), false, word)
	})

	it('the problem handed to the browser carries no tests, hints, solutions or topics', () => {
		assert.match(examPage, /toExamProblem\(problem\)/)
		assert.doesNotMatch(
			exam,
			/conceptTags|knownStrategies|correctnessHints|optimization|problem\.tests/
		)
	})
})

describe('the Practice look with exactly two panes', () => {
	it('reuses the Practice frame, panes and editor chrome', () => {
		for (const needle of ['practice.module.css', 'workspace.module.css', 'ws.pane', 'ws.paneCode'])
			assert.ok(exam.includes(needle), needle)
		assert.match(examPage, /<AppShell bare startCollapsed>/)
	})

	it('has a problem pane and a code pane only: no results, tutor or third pane', () => {
		assert.equal((exam.match(/className=\{[^}]*\bws\.pane\b/g) ?? []).length, 2)
		assert.doesNotMatch(exam, /resultsHead|WorkspaceLayout|ws\.paneTutor/)
	})

	it('the divider is a keyboard operable, labelled separator', () => {
		assert.match(exam, /role="separator"/)
		assert.match(exam, /aria-label=\{t\('resizePanes'\)\}/)
		assert.match(exam, /ArrowLeft/)
		assert.match(exam, /ArrowRight/)
	})
})

describe('the timer is a soft target owned by the server clock', () => {
	it('the clock comes from the server-recorded start and the server\'s "now"', () => {
		assert.match(exam, /dailyClock\(/)
		assert.match(
			exam,
			/startedAt: view\?\.startedAt \?\? null, submittedAt: view\?\.submittedAt \?\? null/
		)
		assert.match(exam, /Date\.parse\(serverNow\) - Date\.now\(\)/)
		assert.match(exam, /startChallengeAction\(\{ date \}\)/)
	})

	it('shows the countdown, then Overtime, then a stopped time at the final submit', () => {
		for (const needle of [
			"clock.phase === 'running'",
			"clock.phase === 'overtime'",
			"clock.phase === 'submitted'",
			"t('overtime')",
			"t('submittedBadge')"
		])
			assert.ok(exam.includes(needle), needle)
		// The tick runs only while the challenge is open.
		assert.match(exam, /if \(!open\) return/)
	})

	it('never auto-submits, expires, or blocks Run or Submit on time', () => {
		assert.doesNotMatch(exam, /deadline|expire|setTimeout/i)
		// Controls are disabled only while a request is in flight, never by the clock.
		const disabled = [...exam.matchAll(/disabled=\{([^}]*)\}/g)].map((m) => m[1])
		assert.ok(disabled.length >= 4)
		for (const condition of disabled) assert.match(condition ?? '', /^busy != null$/)
		// Nothing calls submit from a timer or an effect.
		assert.equal((exam.match(/\bsubmit\(\)/g) ?? []).length, 1, 'only its definition')
		assert.match(exam, /onClick=\{submit\}/)
	})

	it('Run uses the public examples and never reaches a server action', () => {
		assert.match(exam, /runCode\(exampleRunRequest\(problem, code\)\)/)
		const runFn = exam.slice(
			exam.indexOf('async function run()'),
			exam.indexOf('async function submit()')
		)
		assert.doesNotMatch(runFn, /Action\(|saveAttempt/)
	})
})

describe('the ONE final submission', () => {
	it('is a two-step confirm before anything is sent', () => {
		assert.match(exam, /setConfirming\(true\)/)
		assert.match(exam, /t\('confirmText'\)/)
		assert.match(exam, /t\('confirmSubmit'\)/)
	})

	it('sends only the date and the source: no pass count, result or time from the browser', () => {
		assert.match(exam, /submitChallengeAction\(\{ date, source: code \}\)/)
		const calls = [...exam.matchAll(/(start|submit|status)\w*Action\(\{([^}]*)\}\)/gi)].map(
			(m) => m[2] ?? ''
		)
		assert.equal(calls.length, 3)
		for (const args of calls) assert.match(args, /^\s*date(, source: code)?\s*$/)
		// The browser's own test results are never used for the final result.
		assert.doesNotMatch(exam, /saveAttempt|submitRunRequest|allPassed|testsPassed:/)
	})

	it('shows "grading pending" when saved but not graded, and the verified counts when graded', () => {
		for (const needle of [
			"t('pendingHeading')",
			"t('pending')",
			"t('grading')",
			"t('resultCounts'",
			"t('passedHeading')",
			"t('failedHeading')"
		])
			assert.ok(exam.includes(needle), needle)
		assert.match(String(messages.Challenge.pending), /Submission saved — grading pending/)
	})

	it('polls for the result only while it is waiting and grading is switched on', () => {
		assert.match(exam, /if \(!gradingOn \|\| !pending\) return/)
		assert.match(exam, /challengeStatusAction\(\{ date \}\)/)
	})

	it('a failed final submission cannot be retried: the editor is gone and no Submit remains', () => {
		// The editor and the Submit footer exist only while the challenge is open.
		assert.match(exam, /\{open \? \(\s*<div className=\{styles\.editorFill\}>/)
		assert.match(exam, /\{open \? \(\s*<div className=\{styles\.foot\}>/)
		assert.match(String(messages.Challenge.failedBody), /cannot be retried today/)
	})
})

describe('states and accessibility', () => {
	it('covers not started, running, overtime, submitted/pending, graded and errors', () => {
		for (const needle of [
			'phase == null',
			'open ? (',
			'pending ? (',
			'graded && view != null',
			"clock.phase === 'overtime'",
			'role="alert"'
		])
			assert.ok(exam.includes(needle), needle)
	})

	it('announces status changes and labels the timer and editor', () => {
		assert.match(exam, /aria-live="polite"/)
		assert.match(exam, /aria-label=\{t\('timeLeftLabel'\)\}/)
		assert.match(exam, /aria-label=\{t\('overtimeLabel'\)\}/)
		assert.match(exam, /ariaLabel=\{t\('editor'\)\}/)
	})

	it('after grading it shows the personal time and AI feedback, clearly qualified, pass or fail', () => {
		assert.match(exam, /t\('passedBody', \{ time: formatClock\(clock\.elapsedMs\) \}\)/)
		for (const key of [
			'approach',
			'time',
			'space',
			'efficiency',
			'improvement',
			'disclaimer',
			'badge'
		])
			assert.ok(exam.includes(`t('assessment.${key}'`), key)
		assert.match(String(messages.Challenge.assessment.badge), /AI estimate/)
		assert.match(String(messages.Challenge.assessment.disclaimer), /not proof/)
		// The assessment block is inside the graded card, for both a pass and a fail.
		const graded = exam.slice(exam.indexOf('graded && view != null'))
		assert.ok(graded.includes("t('assessment.heading')"))
		assert.ok(graded.includes("t('failedBody')") && graded.includes("t('passedBody'"))
	})

	it('asks for the feedback only once graded, never on Run or while still open', () => {
		assert.match(exam, /if \(!graded \|\| assessment != null \|\| askedRef\.current\) return/)
		assert.match(exam, /assessDailyAction\(\{ date \}\)/)
		const runFn = exam.slice(
			exam.indexOf('async function run()'),
			exam.indexOf('async function submit()')
		)
		assert.doesNotMatch(runFn, /assess/i)
		// A failure shows "unavailable"; nothing is estimated in the browser.
		assert.match(exam, /aiFailed \? t\('assessment\.unavailable'\)/)
		assert.doesNotMatch(exam, /assessApproach|kindOf|codeFeatures/)
	})

	it('the future is a 404, a past day with no attempt redirects to Practice, and the page needs a signed-in learner', () => {
		assert.match(
			examPage,
			/lookup\.status === 'locked'[\s\S]*?lookup\.status === 'before_launch'[\s\S]*?notFound\(\)/
		)
		assert.match(examPage, /lookup\.kind === 'past' && !hasAttempt/)
		// ...and that practice-only day goes straight into the Practice workspace.
		assert.match(examPage, /redirect\(\{ href: `\/practice\/\$\{problem\.slug\}`, locale \}\)/)
		assert.match(examPage, /currentAccountSafe\(\)/)
		assert.match(examPage, /robots: \{ index: false/)
	})
})

describe('the leaderboard is hidden, not deleted', () => {
	const visibility = read('../../lib/challenge/visibility.ts')
	const settings = read('../../app/[locale]/settings/page.tsx')

	it('one switch, off, gates the page and the settings opt-in', () => {
		assert.match(visibility, /LEADERBOARD_VISIBLE = false/)
		assert.match(board, /if \(!LEADERBOARD_VISIBLE\) notFound\(\)/)
		assert.match(settings, /LEADERBOARD_VISIBLE \? getLeaderboardConsent\(\) : null/)
	})

	it('nothing in the challenge, the calendar or the problems page links to it', () => {
		const problems = read('../../app/[locale]/problems/page.tsx')
		for (const source of [exam, examPage, calendar, problems])
			assert.doesNotMatch(source, /\/leaderboard/)
	})
})

describe('the calendar and the (hidden) leaderboard', () => {
	it('a past day links straight to Practice for its problem; today is the Daily Exam entry', () => {
		// Past days are unchanged (Practice, or the challenge URL for an unpinned day)...
		assert.match(
			calendar,
			/isToday\s*\?\s*'\/exam\/preview'\s*:\s*slug == null\s*\?\s*`\/challenge\/\$\{iso\}`\s*:\s*`\/practice\/\$\{slug\}`/
		)
		// ...while today, in the date cell and the card, goes to the Daily Exam and names no problem.
		assert.match(calendar, /<Link href="\/exam\/preview" className=\{styles\.todayRow\}>/)
		assert.match(calendar, /const title = slug == null \|\| isToday \? undefined/)
		assert.doesNotMatch(calendar, /titles\[todaySlug\]/)
	})

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

	it('every message the challenge, its page and the calendar use exists', () => {
		for (const key of keys(exam)) assert.ok(has('Challenge', key), `Challenge.${key}`)
		for (const key of keys(examPage)) assert.ok(has('Challenge', key), `Challenge.${key}`)
		for (const key of ['generic', 'unauthenticated', 'notLive', 'notStarted', 'empty', 'tooLarge'])
			assert.ok(has('Challenge', `errors.${key}`), key)
		assert.ok(has('ProblemsPage', 'calendar.todayDone'))
		assert.ok(has('ProblemsPage', 'calendar.todaySubmitted'))
		for (const level of ['brute_force', 'reasonably_efficient', 'optimal'])
			assert.ok(has('Challenge', `assessment.levels.${level}`), level)
	})

	it('the rules and results read correctly with real values', () => {
		const c = t('Challenge')
		assert.match(c('rules.time', { minutes: 30 }), /30-minute target/)
		assert.match(c('rules.time', { minutes: 30 }), /nothing stops at zero/)
		assert.match(c('rules.once'), /ONE final Submit/)
		assert.match(c('rules.once'), /cannot try again today/)
		assert.equal(c('resultCounts', { passed: 11, total: 12 }), '11 of 12 tests passed')
		assert.match(c('passedBody', { time: '14:08' }), /14:08.*streak and your reviews/)
		assert.match(c('pending'), /Submission saved — grading pending/)
		assert.match(c('rules.personal'), /Nothing is scored, ranked or compared/)
	})

	it('claims no ranking, proctoring or comparison', () => {
		const text = JSON.stringify(messages.Challenge).toLowerCase()
		for (const word of ['cheat', 'proctor', 'monitor', 'camera', 'surveillance', 'detect', 'rank'])
			if (word === 'rank') assert.match(text, /scored, ranked or compared/)
			else assert.equal(text.includes(word), false, word)
	})
})
