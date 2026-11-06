import test from 'node:test'
import assert from 'node:assert/strict'
import {
	BACKOFF_BASE_MS,
	BACKOFF_CAP_MS,
	DEFAULT_CLAIM_BUDGET_MS,
	LEASE_MS,
	MAX_ATTEMPTS,
	MAX_FUNCTION_MS,
	NOT_READY_DELAY_MS,
	backoffMs,
	enqueueJobs,
	idempotencyKey,
	runWorker,
	type JobHandler,
	type JobHandlers,
	type JobRow,
	type JobStore,
	type JobType,
	type NewJob
} from './queue.ts'

// specs/features/daily-exam.md § M (AC35–AC41). The fake below implements every store operation
// as ONE synchronous conditional mutation, exactly the atomicity a single conditional UPDATE gives
// in PostgreSQL; concurrency is real interleaving via Promise.all and yielding handlers.

const D = '2026-11-20'
const T0 = Date.parse('2026-11-20T15:30:00.000Z')

function clock(start = T0) {
	let t = start
	return {
		now: () => new Date(t),
		advance: (ms: number) => {
			t += ms
		}
	}
}

function fakeStore(slotCount = 4) {
	const rows = new Map<string, JobRow>()
	const slots = Array.from({ length: slotCount }, (_, i) => ({
		slot: i + 1,
		token: null as string | null,
		until: null as Date | null
	}))
	let seq = 0
	let maxSlotsHeld = 0
	const held = () => slots.filter((s) => s.token != null).length
	const store: JobStore = {
		async enqueue(jobs) {
			let inserted = 0
			for (const job of jobs) {
				if ([...rows.values()].some((r) => r.idempotencyKey === job.idempotencyKey)) continue
				seq += 1
				const id = `job-${seq}`
				rows.set(id, {
					id,
					type: job.type,
					idempotencyKey: job.idempotencyKey,
					examDate: job.examDate,
					attemptId: job.attemptId ?? null,
					status: 'pending',
					runAfter: job.runAfter,
					attempts: 0,
					maxAttempts: job.maxAttempts,
					leaseToken: null,
					leaseExpiresAt: null,
					lastErrorCode: null
				})
				inserted += 1
			}
			return inserted
		},
		async candidates(now, limit) {
			return [...rows.values()]
				.filter(
					(r) =>
						(r.status === 'pending' && r.runAfter <= now) ||
						(r.status === 'running' && r.leaseExpiresAt != null && r.leaseExpiresAt < now)
				)
				.slice(0, limit)
				.map((r) => ({ ...r }))
		},
		async claimPending(id, token, now, leaseUntil) {
			const r = rows.get(id)
			if (r == null || r.status !== 'pending' || r.runAfter > now) return false
			Object.assign(r, { status: 'running', leaseToken: token, leaseExpiresAt: leaseUntil })
			return true
		},
		async reclaimExpired(id, token, now, leaseUntil) {
			const r = rows.get(id)
			if (
				r == null ||
				r.status !== 'running' ||
				r.leaseExpiresAt == null ||
				r.leaseExpiresAt >= now
			)
				return { outcome: 'lost' }
			r.attempts += 1
			if (r.attempts >= r.maxAttempts) {
				Object.assign(r, {
					status: 'dead',
					leaseToken: null,
					leaseExpiresAt: null,
					lastErrorCode: 'lease_expired'
				})
				return { outcome: 'dead' }
			}
			Object.assign(r, { leaseToken: token, leaseExpiresAt: leaseUntil })
			return { outcome: 'claimed', attempts: r.attempts }
		},
		async complete(id, token) {
			const r = rows.get(id)
			if (r == null || r.status !== 'running' || r.leaseToken !== token) return false
			Object.assign(r, { status: 'succeeded', leaseToken: null, leaseExpiresAt: null })
			return true
		},
		async defer(id, token, runAfter) {
			const r = rows.get(id)
			if (r == null || r.status !== 'running' || r.leaseToken !== token) return false
			Object.assign(r, { status: 'pending', runAfter, leaseToken: null, leaseExpiresAt: null })
			return true
		},
		async fail(id, token, _now, code, runAfter) {
			const r = rows.get(id)
			if (r == null || r.status !== 'running' || r.leaseToken !== token) return 'lost'
			r.attempts += 1
			r.lastErrorCode = code
			r.leaseToken = null
			r.leaseExpiresAt = null
			if (runAfter == null) {
				r.status = 'dead'
				return 'dead'
			}
			r.status = 'pending'
			r.runAfter = runAfter
			return 'retry'
		},
		async acquireSlot(token, _jobId, now, leaseUntil) {
			const free = slots.find((s) => s.token == null || (s.until != null && s.until < now))
			if (free == null) return null
			free.token = token
			free.until = leaseUntil
			maxSlotsHeld = Math.max(maxSlotsHeld, held())
			return free.slot
		},
		async releaseSlot(slot, token) {
			const s = slots.find((x) => x.slot === slot)
			if (s != null && s.token === token) {
				s.token = null
				s.until = null
			}
		}
	}
	return { store, rows, maxSlotsHeld: () => maxSlotsHeld }
}

let tokenSeq = 0
const newToken = () => `tok-${++tokenSeq}`
const yieldOnce = () => new Promise<void>((resolve) => setImmediate(resolve))

function handlerSet(overrides: Partial<Record<JobType, JobHandler>> = {}): {
	handlers: JobHandlers
	runs: Map<string, number>
	deadCalls: string[]
} {
	const runs = new Map<string, number>()
	const deadCalls: string[] = []
	const base: JobHandler = {
		ready: async () => ({ ready: true }),
		run: async (job) => {
			runs.set(job.id, (runs.get(job.id) ?? 0) + 1)
			await yieldOnce()
			return { ok: true }
		},
		onDead: async (job) => {
			deadCalls.push(job.id)
		}
	}
	const handlers = Object.fromEntries(
		(
			[
				'EXAM_CLOSEOUT',
				'EXAM_GRADE',
				'EXAM_INTEGRITY_SCORE',
				'EXAM_AI_EVALUATION',
				'EXAM_RESULT_FINALIZATION',
				'EXAM_LEADERBOARD_FINALIZATION',
				'EXAM_NOTIFICATIONS',
				'EXAM_PROBLEM_PUBLICATION',
				'EXAM_RETENTION_CLEANUP'
			] as const
		).map((type) => [type, overrides[type] ?? base])
	) as JobHandlers
	return { handlers, runs, deadCalls }
}

const job = (type: JobType, attemptId?: string, runAfter = new Date(T0)): NewJob => ({
	type,
	examDate: D,
	attemptId: attemptId ?? null,
	runAfter
})

test('idempotency keys are type:date[:attempt][:correction]', () => {
	assert.equal(idempotencyKey({ type: 'EXAM_CLOSEOUT', examDate: D }), `EXAM_CLOSEOUT:${D}`)
	assert.equal(
		idempotencyKey({ type: 'EXAM_GRADE', examDate: D, attemptId: 'a1' }),
		`EXAM_GRADE:${D}:a1`
	)
	assert.equal(
		idempotencyKey({ type: 'EXAM_RESULT_FINALIZATION', examDate: D, correction: 2 }),
		`EXAM_RESULT_FINALIZATION:${D}:c2`
	)
	assert.equal(
		idempotencyKey({ type: 'EXAM_CLOSEOUT', examDate: D, correction: 0 }),
		`EXAM_CLOSEOUT:${D}`
	)
})

test('AC36: a duplicate enqueue inserts nothing', async () => {
	const { store, rows } = fakeStore()
	assert.equal(await enqueueJobs(store, [job('EXAM_CLOSEOUT'), job('EXAM_GRADE', 'a1')]), 2)
	assert.equal(await enqueueJobs(store, [job('EXAM_CLOSEOUT'), job('EXAM_GRADE', 'a1')]), 0)
	assert.equal(await enqueueJobs(store, [job('EXAM_GRADE', 'a2')]), 1)
	assert.equal(rows.size, 3)
	assert.equal(rows.get('job-2')?.maxAttempts, MAX_ATTEMPTS.EXAM_GRADE)
})

test('a job is not claimable before its runAfter (time-driven jobs wait for their boundary)', async () => {
	const c = clock(T0 - 60_000)
	const { store } = fakeStore()
	await enqueueJobs(store, [job('EXAM_CLOSEOUT', undefined, new Date(T0))])
	const { handlers, runs } = handlerSet()
	assert.equal((await runWorker({ store, handlers, now: c.now, newToken })).claimed, 0)
	c.advance(60_000)
	assert.equal((await runWorker({ store, handlers, now: c.now, newToken })).succeeded, 1)
	assert.equal(runs.size, 1)
})

test('AC37: two concurrent workers never both run one job', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(
		store,
		Array.from({ length: 12 }, (_, i) => job('EXAM_INTEGRITY_SCORE', `a${i}`))
	)
	const { handlers, runs } = handlerSet()
	const [a, b] = await Promise.all([
		runWorker({ store, handlers, now: c.now, newToken }),
		runWorker({ store, handlers, now: c.now, newToken })
	])
	assert.equal(a.succeeded + b.succeeded, 12)
	assert.ok(
		[...runs.values()].every((n) => n === 1),
		'every job ran exactly once'
	)
	assert.ok([...rows.values()].every((r) => r.status === 'succeeded'))
})

test('AC38: a worker that crashes after claiming is recovered once its lease expires', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(store, [job('EXAM_CLOSEOUT')])
	// Simulate the crash: claim and never finish.
	assert.equal(await store.claimPending('job-1', 'crashed', c.now(), new Date(T0 + LEASE_MS)), true)
	const { handlers, runs } = handlerSet()
	// Inside the lease nobody can take it.
	c.advance(LEASE_MS - 1000)
	assert.equal((await runWorker({ store, handlers, now: c.now, newToken })).claimed, 0)
	// After it, the next invocation (e.g. after a redeploy) reclaims it; the loss spends an attempt.
	c.advance(2000)
	const stats = await runWorker({ store, handlers, now: c.now, newToken })
	assert.equal(stats.succeeded, 1)
	assert.equal(runs.get('job-1'), 1)
	assert.equal(rows.get('job-1')?.attempts, 1)
	assert.equal(rows.get('job-1')?.status, 'succeeded')
})

test('AC38: a stale worker finishing after a takeover cannot complete or fail the job', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(store, [job('EXAM_GRADE', 'a1')])
	let release: () => void = () => undefined
	const slow = new Promise<void>((resolve) => {
		release = resolve
	})
	let calls = 0
	const { handlers } = handlerSet({
		EXAM_GRADE: {
			ready: async () => ({ ready: true }),
			run: async () => {
				calls += 1
				if (calls === 1) await slow // the first (slow) worker
				return { ok: true }
			}
		}
	})
	const first = runWorker({ store, handlers, now: c.now, newToken, maxJobs: 1 })
	await yieldOnce()
	await yieldOnce()
	// The first worker's lease runs out mid-grade; a second invocation takes over and finishes.
	c.advance(LEASE_MS + 1000)
	const second = await runWorker({ store, handlers, now: c.now, newToken })
	assert.equal(second.succeeded, 1)
	// Now the stale first worker finishes: its fenced completion is refused.
	release()
	const stale = await first
	assert.equal(stale.succeeded, 0)
	assert.equal(stale.stale, 1)
	assert.equal(rows.get('job-1')?.status, 'succeeded')
})

test('AC38: the lease outlives a Vercel function, so a live worker is never overlapped', () => {
	assert.ok(LEASE_MS > MAX_FUNCTION_MS)
	assert.ok(DEFAULT_CLAIM_BUDGET_MS < MAX_FUNCTION_MS)
})

test('AC39: failures back off exponentially, then the job goes dead and onDead runs once', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(store, [job('EXAM_GRADE', 'a1')])
	const { handlers, deadCalls } = handlerSet({
		EXAM_GRADE: {
			ready: async () => ({ ready: true }),
			run: async () => ({ ok: false, code: 'sandbox_unavailable' }),
			onDead: async (j) => {
				deadCalls.push(j.id)
			}
		}
	})
	const delays: number[] = []
	for (let i = 1; i <= MAX_ATTEMPTS.EXAM_GRADE; i += 1) {
		const stats = await runWorker({ store, handlers, now: c.now, newToken })
		assert.equal(stats.claimed, 1, `try ${i}`)
		const row = rows.get('job-1')!
		assert.equal(row.attempts, i)
		assert.equal(row.lastErrorCode, 'sandbox_unavailable')
		if (i < MAX_ATTEMPTS.EXAM_GRADE) {
			assert.equal(row.status, 'pending')
			const delay = row.runAfter.getTime() - c.now().getTime()
			delays.push(delay)
			// Not claimable before its backoff.
			c.advance(delay - 1)
			assert.equal((await runWorker({ store, handlers, now: c.now, newToken })).claimed, 0)
			c.advance(1)
		} else assert.equal(row.status, 'dead')
	}
	assert.deepEqual(delays, [1, 2, 3, 4].map(backoffMs))
	assert.equal(
		delays.reduce((a, b) => a + b, 0),
		15 * 60 * 1000,
		'about 15 minutes of retries'
	)
	assert.deepEqual(deadCalls, ['job-1'])
	// Dead is terminal: nothing claims it again.
	c.advance(24 * 3600_000)
	assert.equal((await runWorker({ store, handlers, now: c.now, newToken })).claimed, 0)
})

test('backoff is capped', () => {
	assert.equal(backoffMs(0), BACKOFF_BASE_MS)
	assert.equal(backoffMs(20), BACKOFF_CAP_MS)
})

test('a permanent failure skips the remaining retries', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(store, [job('EXAM_AI_EVALUATION', 'a1')])
	const { handlers } = handlerSet({
		EXAM_AI_EVALUATION: {
			ready: async () => ({ ready: true }),
			run: async () => ({ ok: false, code: 'attempt_missing', permanent: true })
		}
	})
	await runWorker({ store, handlers, now: c.now, newToken })
	assert.equal(rows.get('job-1')?.status, 'dead')
	assert.equal(rows.get('job-1')?.attempts, 1)
})

test('a crash loop also ends in dead: lost leases spend attempts', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(store, [job('EXAM_AI_EVALUATION', 'a1')])
	const { handlers, deadCalls } = handlerSet()
	for (let i = 0; i < MAX_ATTEMPTS.EXAM_AI_EVALUATION; i += 1) {
		const r = rows.get('job-1')!
		if (r.status === 'pending')
			await store.claimPending(
				'job-1',
				`crash-${i}`,
				c.now(),
				new Date(c.now().getTime() + LEASE_MS)
			)
		else
			await store.reclaimExpired(
				'job-1',
				`crash-${i}`,
				c.now(),
				new Date(c.now().getTime() + LEASE_MS)
			)
		c.advance(LEASE_MS + 1)
	}
	await runWorker({ store, handlers, now: c.now, newToken })
	assert.equal(rows.get('job-1')?.status, 'dead')
	assert.deepEqual(deadCalls, ['job-1'])
})

test('AC35: a job whose prerequisites are not met is deferred without spending an attempt', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(store, [job('EXAM_GRADE', 'a1'), job('EXAM_RESULT_FINALIZATION')])
	let gradeDone = false
	const order: JobType[] = []
	const { handlers } = handlerSet({
		EXAM_GRADE: {
			ready: async () => ({ ready: true }),
			run: async () => {
				order.push('EXAM_GRADE')
				gradeDone = true
				return { ok: true }
			}
		},
		EXAM_RESULT_FINALIZATION: {
			ready: async () => (gradeDone ? { ready: true } : { ready: false }),
			run: async () => {
				order.push('EXAM_RESULT_FINALIZATION')
				return { ok: true }
			}
		}
	})
	// Finalisation is claimed first (it sorts first in this fake) but is not ready.
	gradeDone = false
	const blocked = await runWorker({
		store,
		handlers,
		now: c.now,
		newToken,
		filter: (j) => j.type === 'EXAM_RESULT_FINALIZATION'
	})
	assert.equal(blocked.deferred, 1)
	assert.equal(rows.get('job-2')?.attempts, 0)
	assert.equal(rows.get('job-2')?.runAfter.getTime(), T0 + NOT_READY_DELAY_MS)
	await runWorker({ store, handlers, now: c.now, newToken })
	c.advance(NOT_READY_DELAY_MS)
	await runWorker({ store, handlers, now: c.now, newToken })
	assert.deepEqual(order, ['EXAM_GRADE', 'EXAM_RESULT_FINALIZATION'])
	assert.equal(rows.get('job-2')?.status, 'succeeded')
})

test('a duplicate completion is refused', async () => {
	const c = clock()
	const { store } = fakeStore()
	await enqueueJobs(store, [job('EXAM_NOTIFICATIONS')])
	assert.equal(await store.claimPending('job-1', 't', c.now(), new Date(T0 + LEASE_MS)), true)
	assert.equal(await store.complete('job-1', 't', c.now()), true)
	assert.equal(await store.complete('job-1', 't', c.now()), false)
})

test('AC37: Sandbox slots bound concurrent grades exactly, across concurrent invocations', async () => {
	const c = clock()
	const { store, rows, maxSlotsHeld } = fakeStore(2)
	await enqueueJobs(
		store,
		Array.from({ length: 9 }, (_, i) => job('EXAM_GRADE', `a${i}`))
	)
	let running = 0
	let peak = 0
	const { handlers } = handlerSet({
		EXAM_GRADE: {
			ready: async () => ({ ready: true }),
			run: async () => {
				running += 1
				peak = Math.max(peak, running)
				await yieldOnce()
				await yieldOnce()
				running -= 1
				return { ok: true }
			}
		}
	})
	for (let round = 0; round < 10; round += 1) {
		await Promise.all([
			runWorker({ store, handlers, now: c.now, newToken }),
			runWorker({ store, handlers, now: c.now, newToken }),
			runWorker({ store, handlers, now: c.now, newToken })
		])
		c.advance(20_000)
	}
	assert.ok(peak <= 2, `peak ${peak}`)
	assert.ok(maxSlotsHeld() <= 2)
	assert.ok([...rows.values()].every((r) => r.status === 'succeeded'))
	// Waiting for a slot never spends an attempt.
	assert.ok([...rows.values()].every((r) => r.attempts === 0))
})

test('AC40: an invocation stops claiming once its budget is spent', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(
		store,
		Array.from({ length: 30 }, (_, i) => job('EXAM_INTEGRITY_SCORE', `a${i}`))
	)
	const { handlers } = handlerSet({
		EXAM_INTEGRITY_SCORE: {
			ready: async () => ({ ready: true }),
			run: async () => {
				c.advance(50_000) // each job "takes" 50 s
				return { ok: true }
			}
		}
	})
	const stats = await runWorker({ store, handlers, now: c.now, newToken, batchSize: 1 })
	assert.equal(stats.stoppedBy, 'budget')
	assert.ok(stats.succeeded >= 4 && stats.succeeded <= 6, `ran ${stats.succeeded}`)
	const left = [...rows.values()].filter((r) => r.status === 'pending').length
	assert.equal(left, 30 - stats.succeeded, 'the rest wait, untouched, for the next invocation')
})

test('AC43: a filtered nudge works only the jobs it is allowed to', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(store, [job('EXAM_AI_EVALUATION', 'mine'), job('EXAM_AI_EVALUATION', 'other')])
	const { handlers } = handlerSet()
	await runWorker({
		store,
		handlers,
		now: c.now,
		newToken,
		maxJobs: 1,
		filter: (j) => j.attemptId === 'mine'
	})
	assert.equal(rows.get('job-1')?.status, 'succeeded')
	assert.equal(rows.get('job-2')?.status, 'pending')
})

test('a handler that throws is a retryable failure, and a gate that throws defers', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(store, [job('EXAM_CLOSEOUT'), job('EXAM_NOTIFICATIONS')])
	const { handlers } = handlerSet({
		EXAM_CLOSEOUT: {
			ready: async () => ({ ready: true }),
			run: async () => {
				throw new Error('boom')
			}
		},
		EXAM_NOTIFICATIONS: {
			ready: async () => {
				throw new Error('gate down')
			},
			run: async () => ({ ok: true })
		}
	})
	await runWorker({ store, handlers, now: c.now, newToken })
	assert.equal(rows.get('job-1')?.status, 'pending')
	assert.equal(rows.get('job-1')?.lastErrorCode, 'exception')
	assert.equal(rows.get('job-1')?.attempts, 1)
	assert.equal(rows.get('job-2')?.status, 'pending')
	assert.equal(rows.get('job-2')?.attempts, 0)
})

test('recovery after a restart: a fresh invocation finishes everything left behind', async () => {
	const c = clock()
	const { store, rows } = fakeStore()
	await enqueueJobs(store, [
		job('EXAM_CLOSEOUT'),
		job('EXAM_GRADE', 'a1'),
		job('EXAM_NOTIFICATIONS')
	])
	// A deployment kills the process with two jobs claimed and one never started.
	await store.claimPending('job-1', 'old-1', c.now(), new Date(T0 + LEASE_MS))
	await store.claimPending('job-2', 'old-2', c.now(), new Date(T0 + LEASE_MS))
	c.advance(LEASE_MS + 1)
	const { handlers } = handlerSet()
	await runWorker({ store, handlers, now: c.now, newToken })
	assert.ok([...rows.values()].every((r) => r.status === 'succeeded'))
})
