// Trust-boundary contract for competitive grading (ADR-0007). The runner cannot import
// server-only modules or a database, so these pin the security properties by reading the
// sources (comments stripped: they name the things they forbid) and by scanning the tree.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FLAGS } from '../../lib/flags/flags.ts'

const SRC = new URL('../../', import.meta.url).pathname
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(new URL(p, import.meta.url), 'utf8'))

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name === '.next') continue
		const full = join(dir, name)
		if (statSync(full).isDirectory()) walk(full, out)
		else if (/\.(ts|tsx|mts)$/.test(name)) out.push(full)
	}
	return out
}
const files = walk(SRC)
const isTest = (f: string) => /\.test\.mts$/.test(f)

const store = read('./store.ts')
const actions = read('../actions/challenge.ts')
const challenge = read('./challenge.ts')
const leaderboard = read('./leaderboard.ts')
const grade = read('./grade.ts')
const hiddenWrapper = read('./hidden-suites.ts')
const packageJson = JSON.parse(
	readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
)

describe('hidden tests never reach the browser', () => {
	it('only code under src/server/challenge may import the hidden suites', () => {
		const offenders = files.filter(
			(f) =>
				!isTest(f) &&
				!f.includes('/src/server/challenge/') &&
				/hidden-suites/.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''))
		)
		assert.deepEqual(
			offenders.map((f) => f.replace(SRC, '')),
			[]
		)
	})

	it('the wrapper that application code uses is server-only, so a client import fails the build', () => {
		assert.match(
			readFileSync(new URL('./hidden-suites.ts', import.meta.url), 'utf8'),
			/^import 'server-only'/m
		)
		assert.match(hiddenWrapper, /hidden-suites\.data/)
	})

	it('no client component, page or src/lib module (tests aside) reaches into src/server/challenge', () => {
		const offenders = files.filter((f) => {
			if (isTest(f) || f.includes('/src/server/')) return false
			const text = readFileSync(f, 'utf8')
			const client = /^['"]use client['"]/m.test(text)
			return (
				(client || f.includes('/src/components/') || f.includes('/src/lib/')) &&
				/@\/server\/challenge|server\/challenge\//.test(text.replace(/\/\/.*$/gm, ''))
			)
		})
		assert.deepEqual(
			offenders.map((f) => f.replace(SRC, '')),
			[]
		)
	})

	it('the exam page hands the browser only the statement, examples and starter', () => {
		const page = readFileSync(join(SRC, 'app/[locale]/challenge/[date]/page.tsx'), 'utf8')
		assert.doesNotMatch(strip(page), /\.tests\b|HIDDEN|hidden-suites|expected/)
	})
})

describe('a browser can never supply a score', () => {
	it('every action input is strict and carries no score, pass count, status, time or id', () => {
		for (const schema of actions.match(/input: z[\s\S]*?\.strict\(\)/g) ?? [])
			assert.doesNotMatch(schema, /score|passed|status|elapsed|userId|attemptId/i)
		assert.equal((actions.match(/\.strict\(\)/g) ?? []).length, 4)
		assert.doesNotMatch(actions, /userId/)
	})

	it('a score is written in exactly one place, the grading-completion transaction', () => {
		// `score: true` is a column in a select; an ASSIGNMENT is `score: <something else>`.
		assert.equal((store.match(/\bscore: (?!true)/g) ?? []).length, 1)
		assert.equal((store.match(/status: 'graded'/g) ?? []).length, 1)
		const complete = store.slice(
			store.indexOf('async completeGrading'),
			store.indexOf('async failGrading')
		)
		assert.match(complete, /status: 'grading'/)
		assert.ok(complete.includes('score: record.score'))
	})

	it("the learner is always the session's, never a request value", () => {
		// Reads use currentUserIdSafe; the one write that creates a row referencing users
		// (Start) uses currentLearnerId, which ensures that row exists.
		assert.equal((challenge.match(/currentUserIdSafe\(\)/g) ?? []).length, 2)
		assert.equal((challenge.match(/currentLearnerId\(\)/g) ?? []).length, 1)
		assert.match(read('./leaderboard.ts'), /currentUserIdSafe\(\)/)
	})
})

describe('grading is off unless deliberately enabled and verified', () => {
	it('the flag defaults to off', () => {
		assert.equal(FLAGS.challenge_competitive_grading.default, false)
	})

	it('no grader exists unless the flag is on AND the Sandbox SDK loads', () => {
		assert.match(grade, /enabled !== true\) return null/)
		assert.match(grade, /factory == null\) return null/)
	})

	it('the Sandbox SDK is installed, but only reachable behind the off-by-default flag', () => {
		assert.ok('@vercel/sandbox' in packageJson.dependencies)
		assert.match(grade, /challenge_competitive_grading/)
		assert.ok(
			grade.indexOf('challenge_competitive_grading') < grade.indexOf('loadSandboxFactory()')
		)
		const flags = read('../../lib/flags/flags.ts')
		assert.match(flags, /challenge_competitive_grading: \{\s*default: false/)
	})

	it('without a grader a submission is stored and waits; nothing else produces a score', () => {
		assert.match(challenge, /await activeGrader\(\)/)
		// The orchestration returns before claiming when no grader is passed.
		const svc = readFileSync(new URL('../../lib/challenge/service.ts', import.meta.url), 'utf8')
		assert.match(svc, /if \(grader == null\) return \{ status: 'no_grader' \}/)
	})

	it('learner code never runs in the Next.js process: nothing here spawns or evals', () => {
		for (const text of [store, challenge, leaderboard, grade, read('./sandbox.ts')]) {
			assert.doesNotMatch(text, /child_process|node:vm|\beval\(|new Function|spawn\(|exec\(/)
		}
	})
})

describe('privacy', () => {
	it('the leaderboard reads graded attempts only and never selects source, email or a public id', () => {
		assert.match(leaderboard, /status: 'graded'/)
		assert.doesNotMatch(leaderboard, /\bsource\b|\bemail\b/)
		assert.doesNotMatch(leaderboard, /attemptId/)
	})

	it('the weekly archive stores numbers and ranks only', () => {
		const schema = readFileSync(
			new URL('../../../prisma/schema/challenges.prisma', import.meta.url),
			'utf8'
		)
		const standing = schema.slice(schema.indexOf('model WeeklyStanding'))
		assert.doesNotMatch(standing, /source|email|username/i)
	})

	it('consent is its own column on User, defaults to false, and is separate from profile visibility', () => {
		const user = readFileSync(
			new URL('../../../prisma/schema/example.prisma', import.meta.url),
			'utf8'
		)
		assert.match(user, /leaderboardOptIn\s+Boolean\s+@default\(false\)/)
		assert.doesNotMatch(
			leaderboard,
			/profileVisibility\s*===?\s*'PUBLIC'\s*&&\s*optedIn|optedIn\s*\|\|\s*profile/
		)
	})

	it('submitted source is private: it is selected only to grade it and to record a verified solve', () => {
		const selectingSource = files.filter(
			(f) =>
				!isTest(f) &&
				/select:[^}]*\bsource: true/.test(readFileSync(f, 'utf8')) &&
				/challengeAttempt/.test(readFileSync(f, 'utf8'))
		)
		assert.deepEqual(
			selectingSource.map((f) => f.replace(SRC, '')),
			['server/challenge/store.ts']
		)
	})
})

describe('a verified solve counts for the streak exactly once', () => {
	it('the Attempt is created only by the winner of the grading transition, then linked', () => {
		const complete = store.slice(
			store.indexOf('async completeGrading'),
			store.indexOf('async failGrading')
		)
		assert.ok(
			complete.indexOf('if (count !== 1) return false') < complete.indexOf('tx.attempt.create')
		)
		assert.match(complete, /testsPassed === record\.testsTotal/)
		assert.match(complete, /attemptId: attempt\.id/)
		assert.match(complete, /isMeaningfulAttempt\(slug, row\.source\)/)
	})

	it('a failing or partial verified result records no Attempt', () => {
		const complete = store.slice(
			store.indexOf('async completeGrading'),
			store.indexOf('async failGrading')
		)
		assert.equal((complete.match(/tx\.attempt\.create/g) ?? []).length, 1)
		assert.match(
			complete,
			/if \(record\.testsTotal > 0 && record\.testsPassed === record\.testsTotal\)/
		)
	})
})

describe('safely unavailable when the database or the grader is not ready', () => {
	function fn(source: string, header: string): string {
		const start = source.indexOf(header)
		assert.ok(start >= 0, header)
		const rest = source.slice(start + header.length)
		const next = rest.search(/\nexport (async )?(function|const)/)
		return next < 0 ? rest : rest.slice(0, next)
	}

	it('every read the pages make catches a missing table or column and degrades', () => {
		for (const [source, header, fallback] of [
			[challenge, 'export async function getChallenge', "status: 'unavailable'"],
			[challenge, 'export const getPinnedChallenges', 'return {}'],
			[challenge, 'export async function getMyAttempt', 'available: false'],
			[leaderboard, 'export const getLeaderboard', 'return empty'],
			[leaderboard, 'export async function getLeaderboardConsent', 'available: false']
		] as const) {
			const body = fn(source, header)
			assert.match(body, /catch \(error\)/, header)
			assert.ok(body.includes(fallback), `${header} falls back with ${fallback}`)
			assert.match(body, /captureError\(/, `${header} reports instead of swallowing`)
		}
	})

	it('Start, Submit and the status poll refuse cleanly when the challenge cannot be resolved', () => {
		assert.match(
			challenge,
			/lookup\.status === 'unavailable'\) return \{ ok: false, error: 'unavailable' \}/
		)
	})

	it('the Settings page and the calendar render without any challenge data', () => {
		const settings = read('../../app/[locale]/settings/page.tsx')
		assert.match(settings, /consent\.authenticated && consent\.available \? \(/)
		const problems = read('../../app/[locale]/problems/page.tsx')
		assert.match(problems, /getChallenge\(todayIso\)\.then\(\(\) => getPinnedChallenges\(\)\)/)
	})

	it('nothing in the sign-in or learning-write path depends on an M9B table or column', () => {
		for (const f of [
			'../auth/provision-user.ts',
			'../actions/learning.ts',
			'../../lib/rbac/context.ts'
		]) {
			assert.doesNotMatch(read(f), /challenge|leaderboardOptIn|weeklyStanding|dailyChallenge/i, f)
		}
	})
})

describe('time and recovery', () => {
	it('Start needs the live day; Submit and status do not, so a late-evening attempt survives midnight', () => {
		const start = challenge.slice(
			challenge.indexOf('export async function startChallenge'),
			challenge.indexOf('export async function submitChallenge')
		)
		const submit = challenge.slice(
			challenge.indexOf('export async function submitChallenge'),
			challenge.indexOf('// The polled status')
		)
		assert.match(start, /liveChallenge\(rawDate\)/)
		assert.doesNotMatch(submit, /liveChallenge|not_live/)
		assert.match(submit, /getChallenge\(rawDate\)/)
	})

	it("the page shows the learner's own attempt even after midnight; a past date with none is practice only", () => {
		const page = read('../../app/[locale]/challenge/[date]/page.tsx')
		assert.match(page, /const hasAttempt = mine\.available && mine\.view != null/)
		assert.match(page, /lookup\.kind === 'past' && !hasAttempt/)
	})

	it('Start provisions the users row it references; reads do not need to', () => {
		const start = challenge.slice(
			challenge.indexOf('export async function startChallenge'),
			challenge.indexOf('export async function submitChallenge')
		)
		assert.match(start, /currentLearnerId\(\)/)
	})

	it('the weekly archive waits for pending gradings, and the cron retries them independently', () => {
		assert.match(leaderboard, /shouldArchiveWeek\(week, now, pending\)/)
		assert.match(leaderboard, /status: \{ in: \['submitted', 'grading', 'grader_error'\] \}/)
		const cron = read('../api/learning-reminders-cron.ts')
		assert.match(cron, /gradePendingAttempts\(\)/)
		assert.match(cron, /area: 'challenge-grading-cron'/)
		assert.ok(
			cron.indexOf('gradePendingAttempts()') < cron.indexOf('closeFinishedWeeks()'),
			'grade before archiving'
		)
	})

	it('retrying does nothing unless a grader is configured', () => {
		const retry = challenge.slice(challenge.indexOf('export async function gradePendingAttempts'))
		assert.match(retry, /if \(grader == null\) return \{ attempted: 0 \}/)
	})
})

describe('cron', () => {
	it('closes finished weeks as its own independent step', () => {
		const cron = read('../api/learning-reminders-cron.ts')
		assert.match(cron, /closeFinishedWeeks\(\)/)
		assert.match(cron, /area: 'leaderboard-close-cron'/)
	})
})
