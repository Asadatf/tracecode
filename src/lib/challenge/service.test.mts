import test from 'node:test'
import assert from 'node:assert/strict'
import {
	GRADING_CLAIM_TTL_MS,
	GRADING_RETRY_BACKOFF_MS,
	MAX_GRADING_TRIES,
	triesOf,
	gradeAttempt,
	startAttempt,
	submitAttempt,
	toAttemptView,
	type AttemptRow,
	type ChallengeAttemptStore,
	type Grader,
	type GradeRecord
} from './service.ts'
import { EXAM_DURATION_MS, SUBMIT_GRACE_MS } from './exam-rules.ts'
import { dailyScore } from './scoring.ts'
import { attemptQualifies } from '../streak/streak.ts'
import { buildDailyActivity } from '../activity/daily-activity.ts'
import { computeStreak } from '../streak/streak.ts'

// An in-memory challenge_attempts table with the real semantics: a unique (user, date)
// key, and every mutation ONE conditional update on the state the caller expects. Every
// method yields, so concurrent callers genuinely interleave.
function fakeStore() {
	const rows = new Map<
		string,
		AttemptRow & { source: string | null; claimedAt: Date | null; weekStart: string }
	>()
	const solves: { userId: string; date: string }[] = []
	const key = (u: string, d: string) => `${u}|${d}`
	const tick = () => new Promise((r) => setImmediate(r))
	const store: ChallengeAttemptStore = {
		async find(u, d) {
			await tick()
			const row = rows.get(key(u, d))
			return row == null ? null : { ...row }
		},
		async create({ userId, date, startedAt, deadlineAt, weekStart }) {
			await tick()
			if (rows.has(key(userId, date))) return false
			rows.set(key(userId, date), {
				id: `a-${rows.size + 1}`,
				userId,
				challengeDate: date,
				status: 'started',
				startedAt,
				deadlineAt,
				submittedAt: null,
				elapsedMs: null,
				testsPassed: null,
				testsTotal: null,
				score: null,
				gradeError: null,
				gradingClaimedAt: null,
				source: null,
				claimedAt: null,
				weekStart
			})
			return true
		},
		async submit({ userId, date, source, submittedAt, elapsedMs }) {
			await tick()
			const row = rows.get(key(userId, date))
			if (!row || row.status !== 'started') return false
			if (row.deadlineAt.getTime() < submittedAt.getTime() - SUBMIT_GRACE_MS) return false
			Object.assign(row, { status: 'submitted', source, submittedAt, elapsedMs })
			return true
		},
		async expire(userId, date, now) {
			await tick()
			const row = rows.get(key(userId, date))
			if (
				!row ||
				row.status !== 'started' ||
				row.deadlineAt.getTime() >= now.getTime() - SUBMIT_GRACE_MS
			)
				return false
			row.status = 'expired'
			return true
		},
		async claimGrading(userId, date, now, staleBefore) {
			await tick()
			const row = rows.get(key(userId, date))
			if (!row) return false
			const stale = row.status === 'grading' && row.claimedAt != null && row.claimedAt < staleBefore
			if (!(row.status === 'submitted' || row.status === 'grader_error' || stale)) return false
			Object.assign(row, { status: 'grading', claimedAt: now, gradingClaimedAt: now })
			return true
		},
		async completeGrading(userId, date, record: GradeRecord) {
			await tick()
			const row = rows.get(key(userId, date))
			if (!row || row.status !== 'grading') return false
			Object.assign(row, {
				status: 'graded',
				testsPassed: record.testsPassed,
				testsTotal: record.testsTotal,
				score: record.score
			})
			if (record.testsPassed === record.testsTotal) solves.push({ userId, date })
			return true
		},
		async failGrading(userId, date, code) {
			await tick()
			const row = rows.get(key(userId, date))
			if (!row || row.status !== 'grading') return false
			Object.assign(row, { status: 'grader_error', gradeError: code })
			return true
		},
		async readSource(u, d) {
			return rows.get(key(u, d))?.source ?? null
		}
	}
	return { store, rows, solves }
}

const D = '2026-11-10'
const T0 = new Date('2026-11-10T10:00:00.000Z')
const at = (ms: number) => new Date(T0.getTime() + ms)
const pass = (passed: number, total: number): Grader => ({
	grade: async () => ({ ok: true, testsPassed: passed, testsTotal: total, graderVersion: 'test' })
})

test('one attempt per learner per challenge: starting again returns the same attempt and clock', async () => {
	const { store, rows } = fakeStore()
	const first = await startAttempt(store, 'u1', D, T0)
	assert.ok(first.ok && first.created)
	const again = await startAttempt(store, 'u1', D, at(5 * 60_000)) // a refresh, 5 minutes later
	assert.ok(again.ok && !again.created)
	assert.equal(again.attempt.startedAt.toISOString(), T0.toISOString())
	assert.equal(again.attempt.deadlineAt.toISOString(), at(EXAM_DURATION_MS).toISOString())
	assert.equal(rows.size, 1)
})

test('simultaneous starts create exactly one attempt', async () => {
	const { store, rows } = fakeStore()
	const results = await Promise.all(
		Array.from({ length: 8 }, (_, i) => startAttempt(store, 'u1', D, at(i * 1000)))
	)
	assert.equal(results.filter((r) => r.ok && r.created).length, 1)
	assert.equal(rows.size, 1)
	const deadlines = new Set(results.map((r) => (r.ok ? r.attempt.deadlineAt.toISOString() : '')))
	assert.equal(deadlines.size, 1, 'everyone sees the one server-set deadline')
})

test('learners are independent: each gets their own attempt and deadline', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await startAttempt(store, 'u2', D, at(10 * 60_000))
	assert.equal(rows.size, 2)
	assert.equal(
		rows.get(`u2|${D}`)?.deadlineAt.toISOString(),
		at(10 * 60_000 + EXAM_DURATION_MS).toISOString()
	)
})

test('submitting before starting is refused', async () => {
	const { store } = fakeStore()
	assert.deepEqual(await submitAttempt(store, 'u1', D, 'code', T0), {
		ok: false,
		error: 'not_started'
	})
})

test('an on-time submission is accepted once and records the server-measured time', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	const result = await submitAttempt(store, 'u1', D, 'def f(): pass', at(12 * 60_000))
	assert.ok(result.ok && result.accepted)
	assert.equal(rows.get(`u1|${D}`)?.elapsedMs, 12 * 60_000)
	assert.equal(rows.get(`u1|${D}`)?.status, 'submitted')
})

test('a submission after the deadline (plus grace) is refused, marks the attempt expired and earns nothing', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	const late = await submitAttempt(
		store,
		'u1',
		D,
		'def f(): pass',
		at(EXAM_DURATION_MS + SUBMIT_GRACE_MS + 1)
	)
	assert.ok(late.ok && !late.accepted && late.reason === 'expired')
	assert.equal(rows.get(`u1|${D}`)?.status, 'expired')
	assert.equal(rows.get(`u1|${D}`)?.source, null, 'a late source is never stored')
	// And it can never be graded afterwards.
	assert.equal(
		(await gradeAttempt(store, pass(10, 10), 'u1', D, 'two-sum', at(EXAM_DURATION_MS + 60_000)))
			.status,
		'not_claimed'
	)
	assert.equal(rows.get(`u1|${D}`)?.score, null)
})

test('a deadline-boundary submission inside the grace is accepted', async () => {
	const { store } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	const edge = await submitAttempt(store, 'u1', D, 'x = 1', at(EXAM_DURATION_MS + SUBMIT_GRACE_MS))
	assert.ok(edge.ok && edge.accepted)
})

test('the deadline is enforced in the write itself: a request that passed the read check but arrives late still loses', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	// Simulate the read-then-write gap: the caller believed "now" was on time, but the
	// conditional update is judged at the real submit instant.
	const ok = await store.submit({
		userId: 'u1',
		date: D,
		source: 'x',
		submittedAt: at(EXAM_DURATION_MS + 60_000),
		elapsedMs: 1
	})
	assert.equal(ok, false)
	assert.equal(rows.get(`u1|${D}`)?.status, 'started')
})

test('duplicate submissions are idempotent: the first source wins and a repeat just reports it', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	const first = await submitAttempt(store, 'u1', D, 'first answer', at(60_000))
	const second = await submitAttempt(store, 'u1', D, 'second answer', at(120_000))
	assert.ok(first.ok && first.accepted)
	assert.ok(second.ok && !second.accepted && second.reason === 'already_submitted')
	assert.equal(rows.get(`u1|${D}`)?.source, 'first answer')
})

test('simultaneous submissions: exactly one is accepted', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	const results = await Promise.all(
		Array.from({ length: 10 }, (_, i) =>
			submitAttempt(store, 'u1', D, `answer ${i}`, at(60_000 + i))
		)
	)
	assert.equal(results.filter((r) => r.ok && r.accepted).length, 1)
	assert.equal(rows.get(`u1|${D}`)?.status, 'submitted')
})

test('empty and oversized sources are refused before anything is stored', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	assert.deepEqual(await submitAttempt(store, 'u1', D, '   \n', at(1000)), {
		ok: false,
		error: 'empty'
	})
	assert.deepEqual(await submitAttempt(store, 'u1', D, 'x'.repeat(20_001), at(1000)), {
		ok: false,
		error: 'too_large'
	})
	assert.equal(rows.get(`u1|${D}`)?.status, 'started')
})

test('with no grader configured a submission waits: it is never scored from anything else', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(60_000))
	assert.deepEqual(await gradeAttempt(store, null, 'u1', D, 'two-sum', at(120_000)), {
		status: 'no_grader'
	})
	const row = rows.get(`u1|${D}`)!
	assert.equal(row.status, 'submitted')
	assert.equal(row.score, null)
	const view = toAttemptView(row, at(120_000))
	assert.equal(view.phase, 'submitted')
	assert.equal(view.score, null)
})

test("a verified result is scored from the SERVER's counts and elapsed time", async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(10 * 60_000))
	const result = await gradeAttempt(store, pass(12, 12), 'u1', D, 'two-sum', at(10 * 60_000 + 5000))
	assert.deepEqual(result, {
		status: 'graded',
		score: dailyScore({ testsPassed: 12, testsTotal: 12, elapsedMs: 10 * 60_000 })
	})
	assert.equal(rows.get(`u1|${D}`)?.status, 'graded')
})

test('a failing result is graded with a partial score and records no solve', async () => {
	const { store, rows, solves } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(60_000))
	const result = await gradeAttempt(store, pass(5, 12), 'u1', D, 'two-sum', at(70_000))
	assert.equal(
		result.status === 'graded' && result.score,
		dailyScore({ testsPassed: 5, testsTotal: 12, elapsedMs: 60_000 })
	)
	assert.equal(solves.length, 0)
	assert.equal(rows.get(`u1|${D}`)?.testsPassed, 5)
})

test('concurrent grading of one submission: exactly one grader writes the score', async () => {
	const { store, solves } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(60_000))
	let calls = 0
	const grader: Grader = {
		grade: async () => {
			calls += 1
			await new Promise((r) => setImmediate(r))
			return { ok: true, testsPassed: 12, testsTotal: 12, graderVersion: 'test' }
		}
	}
	const results = await Promise.all(
		Array.from({ length: 6 }, () => gradeAttempt(store, grader, 'u1', D, 'two-sum', at(70_000)))
	)
	assert.equal(results.filter((r) => r.status === 'graded').length, 1)
	assert.equal(calls, 1, 'only the claim winner ever runs the grader')
	assert.equal(solves.length, 1, 'the verified solve is recorded exactly once')
})

test('grading again after success changes nothing and records no second solve', async () => {
	const { store, solves, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(60_000))
	await gradeAttempt(store, pass(12, 12), 'u1', D, 'two-sum', at(70_000))
	const score = rows.get(`u1|${D}`)?.score
	for (let i = 0; i < 3; i++)
		assert.equal(
			(await gradeAttempt(store, pass(1, 12), 'u1', D, 'two-sum', at(80_000))).status,
			'not_claimed'
		)
	assert.equal(rows.get(`u1|${D}`)?.score, score)
	assert.equal(solves.length, 1)
})

test('a grader failure is recoverable: no score now, retried later, then scored once', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(60_000))
	const broken: Grader = { grade: async () => ({ ok: false, code: 'sandbox_unavailable' }) }
	assert.deepEqual(await gradeAttempt(store, broken, 'u1', D, 'two-sum', at(70_000)), {
		status: 'grader_error',
		code: 'sandbox_unavailable'
	})
	const row = rows.get(`u1|${D}`)!
	assert.equal(row.status, 'grader_error')
	assert.equal(row.score, null, 'a grader error never gives or removes points on its own')
	assert.equal(toAttemptView(row, at(80_000)).score, null)
	assert.equal(
		(await gradeAttempt(store, pass(12, 12), 'u1', D, 'two-sum', at(90_000))).status,
		'retry_later',
		'an immediate retry waits out the backoff'
	)
	const retry = await gradeAttempt(
		store,
		pass(12, 12),
		'u1',
		D,
		'two-sum',
		at(70_000 + GRADING_RETRY_BACKOFF_MS)
	)
	assert.equal(retry.status, 'graded')
})

test('a grader that throws is treated as an error, never a score', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(60_000))
	const result = await gradeAttempt(
		store,
		{
			grade: async () => {
				throw new Error('boom')
			}
		},
		'u1',
		D,
		'two-sum',
		at(70_000)
	)
	assert.deepEqual(result, { status: 'grader_error', code: 'grader_exception' })
	assert.equal(rows.get(`u1|${D}`)?.score, null)
})

test("a crashed grading worker's claim is taken over only after it goes stale", async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(60_000))
	assert.equal(
		await store.claimGrading(
			'u1',
			D,
			at(70_000),
			new Date(at(70_000).getTime() - GRADING_CLAIM_TTL_MS)
		),
		true
	) // crashes here
	assert.equal(
		(await gradeAttempt(store, pass(12, 12), 'u1', D, 'two-sum', at(80_000))).status,
		'not_claimed'
	) // still fresh
	const later = at(70_000 + GRADING_CLAIM_TTL_MS + 1000)
	assert.equal(
		(await gradeAttempt(store, pass(12, 12), 'u1', D, 'two-sum', later)).status,
		'graded'
	)
	assert.equal(rows.get(`u1|${D}`)?.status, 'graded')
})

test('the browser view never carries the source or a score before grading, and nothing a client sends can set one', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'SECRET SOURCE', at(60_000))
	const row = rows.get(`u1|${D}`)!
	// A row that somehow carries numbers before grading still shows none of them.
	const tampered = { ...row, testsPassed: 12, testsTotal: 12, score: 1100 }
	const view = toAttemptView(tampered, at(61_000))
	assert.equal(view.score, null)
	assert.equal(view.testsPassed, null)
	assert.equal(JSON.stringify(view).includes('SECRET SOURCE'), false)
	assert.deepEqual(Object.keys(view).sort(), [
		'deadlineAt',
		'elapsedMs',
		'phase',
		'score',
		'startedAt',
		'testsPassed',
		'testsTotal'
	])
})

test('streak: a verified fully-passing challenge counts as exactly one qualifying day, however many events share the date', () => {
	// The store records an Attempt (completed, meaningful) once, when grading succeeds.
	const verified = {
		createdAt: '2026-11-10T10:20:00Z',
		status: 'completed',
		problemSlug: 'two-sum',
		allPassed: true,
		meaningful: true
	}
	assert.equal(attemptQualifies(verified), true)
	// A practice run the same UTC day plus the challenge solve is still one streak day.
	const practice = {
		createdAt: '2026-11-10T08:00:00Z',
		status: 'completed',
		problemSlug: 'binary-search',
		allPassed: false,
		meaningful: true
	}
	const days = buildDailyActivity([practice, verified])
	assert.equal(days.length, 1)
	assert.equal(days[0]?.attempts, 2, 'both runs are activity; the day itself is counted once')
	assert.deepEqual(
		computeStreak(
			days.map((d) => d.day),
			'2026-11-10'
		),
		{ current: 1, longest: 1, active: false }
	)
})

test('an attempt started late in the day can be submitted after UTC midnight, judged only by its own deadline', async () => {
	const { store, rows } = fakeStore()
	const lateStart = new Date('2026-11-10T23:50:00.000Z')
	await startAttempt(store, 'u1', D, lateStart)
	// 00:10 the next UTC day is 20 minutes in, inside the 30-minute window.
	const after = await submitAttempt(
		store,
		'u1',
		D,
		'def f(): pass',
		new Date('2026-11-11T00:10:00.000Z')
	)
	assert.ok(after.ok && after.accepted)
	assert.equal(rows.get(`u1|${D}`)?.elapsedMs, 20 * 60_000)
	// While 00:21 (31 minutes in) is late.
	const { store: s2 } = fakeStore()
	await startAttempt(s2, 'u2', D, lateStart)
	const late = await submitAttempt(s2, 'u2', D, 'x = 1', new Date('2026-11-11T00:21:00.000Z'))
	assert.ok(late.ok && !late.accepted && late.reason === 'expired')
})

test('retries are bounded: backoff between tries, then it gives up and creates no more sandboxes', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(60_000))
	let calls = 0
	const broken: Grader = {
		grade: async () => {
			calls += 1
			return { ok: false, code: 'sandbox_unavailable' }
		}
	}
	let now = 70_000
	for (let attempt = 1; attempt <= MAX_GRADING_TRIES; attempt += 1) {
		const result = await gradeAttempt(store, broken, 'u1', D, 'two-sum', at(now))
		assert.equal(result.status, 'grader_error', `try ${attempt}`)
		assert.equal(triesOf(rows.get(`u1|${D}`)!.gradeError), attempt)
		// Too soon after a failure: nothing runs.
		assert.equal(
			(await gradeAttempt(store, broken, 'u1', D, 'two-sum', at(now + 1_000))).status,
			attempt === MAX_GRADING_TRIES ? 'gave_up' : 'retry_later'
		)
		now += GRADING_RETRY_BACKOFF_MS * attempt + 1
	}
	assert.equal(calls, MAX_GRADING_TRIES)
	// Long after: still given up, no further execution, and no score either way.
	assert.equal(
		(await gradeAttempt(store, broken, 'u1', D, 'two-sum', at(now + 24 * 3600_000))).status,
		'gave_up'
	)
	assert.equal(calls, MAX_GRADING_TRIES)
	assert.equal(rows.get(`u1|${D}`)?.score, null)
})

test('concurrent triggers of one submission run the grader exactly once', async () => {
	const { store, solves } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'code', at(60_000))
	let calls = 0
	const counting: Grader = {
		grade: async () => {
			calls += 1
			await new Promise((r) => setImmediate(r))
			return { ok: true, testsPassed: 12, testsTotal: 12, graderVersion: 'test' }
		}
	}
	const results = await Promise.all(
		Array.from({ length: 6 }, () => gradeAttempt(store, counting, 'u1', D, 'two-sum', at(70_000)))
	)
	assert.equal(calls, 1)
	assert.equal(results.filter((r) => r.status === 'graded').length, 1)
	assert.equal(solves.length, 1)
})

test('grader errors and exhausted retries never award points and never destroy the submitted source', async () => {
	const { store, rows } = fakeStore()
	await startAttempt(store, 'u1', D, T0)
	await submitAttempt(store, 'u1', D, 'MY SOURCE', at(60_000))
	const broken: Grader = { grade: async () => ({ ok: false, code: 'runner_failed' }) }
	let now = 70_000
	for (let i = 1; i <= MAX_GRADING_TRIES + 2; i += 1) {
		await gradeAttempt(store, broken, 'u1', D, 'two-sum', at(now))
		now += GRADING_RETRY_BACKOFF_MS * MAX_GRADING_TRIES + 1
		const row = rows.get(`u1|${D}`)!
		assert.equal(row.score, null)
		assert.equal(row.testsPassed, null)
		assert.equal(await store.readSource('u1', D), 'MY SOURCE')
		assert.equal(toAttemptView(row, at(now)).score, null)
	}
	assert.equal(rows.get(`u1|${D}`)?.status, 'grader_error')
})
