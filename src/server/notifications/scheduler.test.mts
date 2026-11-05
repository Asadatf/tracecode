import { resolveReminderEmailConfig } from '../../lib/notifications/release-policy.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
	DELIVERY_CLAIM_TTL_MS,
	MAX_DELIVERY_ATTEMPTS,
	dailyLogicalKey,
	emailIdempotencyKey,
	emailSlotOpen,
	rotateForDate,
	runScheduler,
	utcDate,
	type Candidate,
	type EmailChannel,
	type PlannedReminder,
	type SchedulerDeps
} from './scheduler.ts'
import type { SendResult } from '../email/resend.ts'
import type { ReminderPlan } from '../../lib/learning/reminder-plan.ts'
import { planReminder } from '../../lib/learning/reminder-plan.ts'
import { rankRecommendations } from '../../lib/learning/recommend.ts'
import { NESTED, att, buildFor } from '../../lib/learning/evidence-fixtures.mts'
import { PROBLEMS } from '../../lib/trace/problems.ts'

// M7.5B — the daily scheduler against an in-memory world whose claim and insert
// semantics mirror the Prisma store (unique insert = ON CONFLICT DO NOTHING; claim
// = insert-or-conditional-reclaim). No database, no Resend, no OpenRouter.

const NOW = new Date('2026-11-02T15:00:00.000Z')
const DATE = utcDate(NOW)

const PLAN: ReminderPlan = {
	v: 1,
	template: 'unfinished',
	problemSlug: 'two-sum',
	reasonCode: 'open_repeated_failures',
	conceptTag: 'arrays',
	inactiveDays: null
}
const REMINDER: PlannedReminder = { plan: PLAN, problemTitle: 'Two Sum' }

interface User {
	userId: string
	inAppEnabled?: boolean
	emailOptIn?: boolean
	email?: string | null
}

interface Slot {
	reminder: PlannedReminder
	status: string
	attempts: number
	claimedAt: Date | null
	providerMessageId: string | null
	lastError: string | null
}

function world(users: User[]) {
	const notifications = new Map<string, ReminderPlan>()
	const slots = new Map<string, Slot>()
	const sends: { to: string; idempotencyKey: string; reminder: PlannedReminder }[] = []
	let sendImpl: (n: number) => SendResult = () => ({ ok: true, id: 'msg' })
	let failAccept = false

	const candidatesFor = async (date: string): Promise<Candidate[]> =>
		users.map((u) => {
			const slot = slots.get(`${u.userId}|${date}`)
			return {
				userId: u.userId,
				inAppEnabled: u.inAppEnabled ?? true,
				emailOptIn: u.emailOptIn ?? false,
				email: u.email === undefined ? `${u.userId}@example.com` : u.email,
				unsubscribeToken: 'tok',
				inAppDoneToday: notifications.has(`${u.userId}|${dailyLogicalKey(date)}`),
				emailSlot:
					slot == null
						? null
						: {
								status: slot.status,
								attempts: slot.attempts,
								claimedAt: slot.claimedAt?.toISOString() ?? null
							}
			}
		})

	const email: EmailChannel = {
		async claim(userId, date, now, reminder) {
			const key = `${userId}|${date}`
			const row = slots.get(key)
			if (row == null) {
				slots.set(key, {
					reminder,
					status: 'claimed',
					attempts: 1,
					claimedAt: now,
					providerMessageId: null,
					lastError: null
				})
				return { attempts: 1, reminder }
			}
			const stale =
				row.status === 'claimed' &&
				row.claimedAt != null &&
				now.getTime() - row.claimedAt.getTime() >= DELIVERY_CLAIM_TTL_MS
			if (row.attempts < MAX_DELIVERY_ATTEMPTS && (row.status === 'retry' || stale)) {
				row.status = 'claimed'
				row.claimedAt = now
				row.attempts += 1
				return { attempts: row.attempts, reminder: row.reminder }
			}
			return null
		},
		async send({ to, idempotencyKey, reminder }) {
			sends.push({ to, idempotencyKey, reminder })
			return sendImpl(sends.length)
		},
		async markAccepted(userId, date, id) {
			if (failAccept) throw new Error('process crashed before recording')
			const row = slots.get(`${userId}|${date}`)
			if (row) Object.assign(row, { status: 'accepted', providerMessageId: id, lastError: null })
		},
		async markRetry(userId, date, code) {
			const row = slots.get(`${userId}|${date}`)
			if (row) Object.assign(row, { status: 'retry', lastError: code })
		},
		async markFailed(userId, date, code) {
			const row = slots.get(`${userId}|${date}`)
			if (row) Object.assign(row, { status: 'failed', lastError: code })
		}
	}

	const deps = (over: Partial<SchedulerDeps> = {}): SchedulerDeps => ({
		now: NOW,
		deadlineMs: Number.MAX_SAFE_INTEGER,
		maxUsers: 1_000,
		candidates: () => candidatesFor(utcDate(over.now ?? NOW)),
		planFor: async () => REMINDER,
		inApp: {
			async create(userId, logicalKey, plan) {
				const key = `${userId}|${logicalKey}`
				if (notifications.has(key)) return false
				notifications.set(key, plan)
				return true
			}
		},
		email,
		...over
	})

	return {
		notifications,
		slots,
		sends,
		deps,
		email,
		setSend: (fn: (n: number) => SendResult) => {
			sendImpl = fn
		},
		setFailAccept: (v: boolean) => {
			failAccept = v
		}
	}
}

// --- generation ------------------------------------------------------------------

test('a run creates one in-app notification per eligible learner and emails only opted-in ones', async () => {
	const w = world([{ userId: 'u1' }, { userId: 'u2', emailOptIn: true }])
	const summary = await runScheduler(w.deps())
	assert.equal(summary.date, '2026-11-02')
	assert.equal(w.notifications.size, 2)
	assert.deepEqual(w.notifications.get(`u1|daily:2026-11-02`), PLAN)
	assert.equal(w.sends.length, 1)
	assert.equal(w.sends[0]?.to, 'u2@example.com')
	assert.equal(w.slots.get('u2|2026-11-02')?.status, 'accepted')
	assert.equal(summary.inApp.created, 2)
	assert.equal(summary.email.accepted, 1)
	assert.equal(summary.email.notOptedIn, 1)
})

test('cold-start and inactive learners get reminders too (the planner decides the framing)', async () => {
	const cold = { plan: { ...PLAN, template: 'cold_start' as const }, problemTitle: 'Two Sum' }
	const back = {
		plan: { ...PLAN, template: 'returning' as const, inactiveDays: 9 },
		problemTitle: 'Two Sum'
	}
	const w = world([{ userId: 'new' }, { userId: 'away' }])
	await runScheduler(w.deps({ planFor: async (u) => (u === 'new' ? cold : back) }))
	assert.equal(w.notifications.get('new|daily:2026-11-02')?.template, 'cold_start')
	assert.equal(w.notifications.get('away|daily:2026-11-02')?.template, 'returning')
})

// --- dedup -----------------------------------------------------------------------

test('a second run the same day creates and sends nothing new', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true }])
	await runScheduler(w.deps())
	const again = await runScheduler(w.deps())
	assert.equal(w.notifications.size, 1)
	assert.equal(w.sends.length, 1)
	assert.equal(again.processed, 0)
	assert.equal(again.skipped, 1)
})

test('two concurrent runs deliver each channel exactly once', async () => {
	const w = world([
		{ userId: 'u1', emailOptIn: true },
		{ userId: 'u2', emailOptIn: true }
	])
	const [a, b] = await Promise.all([runScheduler(w.deps()), runScheduler(w.deps())])
	assert.equal(w.notifications.size, 2)
	assert.equal(w.sends.length, 2, 'one email per learner, not two')
	assert.equal(a.inApp.created + b.inApp.created, 2)
	assert.equal(a.email.accepted + b.email.accepted, 2)
})

test('the next UTC day is a new slot', async () => {
	const w = world([{ userId: 'u1' }])
	await runScheduler(w.deps())
	await runScheduler(w.deps({ now: new Date('2026-11-03T15:00:00.000Z') }))
	assert.ok(w.notifications.has('u1|daily:2026-11-03'))
})

// --- preferences -----------------------------------------------------------------

test('in-app off and email opt-out are respected independently', async () => {
	const w = world([
		{ userId: 'quiet', inAppEnabled: false, emailOptIn: false },
		{ userId: 'emailOnly', inAppEnabled: false, emailOptIn: true },
		{ userId: 'appOnly', inAppEnabled: true, emailOptIn: false }
	])
	const summary = await runScheduler(w.deps())
	assert.deepEqual([...w.notifications.keys()], ['appOnly|daily:2026-11-02'])
	assert.deepEqual(
		w.sends.map((s) => s.to),
		['emailOnly@example.com']
	)
	assert.equal(summary.skipped, 1, 'the learner with every channel off is not planned at all')
})

test('an opted-in learner with no address on file is not emailed', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true, email: null }])
	const summary = await runScheduler(w.deps())
	assert.equal(w.sends.length, 0)
	assert.equal(summary.email.noAddress, 1)
})

test('missing Resend configuration skips the email channel entirely; in-app still works', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true }])
	const summary = await runScheduler(w.deps({ email: null }))
	assert.equal(w.sends.length, 0)
	assert.equal(w.slots.size, 0, 'no ledger slot is claimed when email is not configured')
	assert.equal(w.notifications.size, 1)
	assert.equal(summary.email.configured, false)
})

// --- provider errors, retries, crash recovery ------------------------------------

test('a transient provider error is retried once in-run with the same idempotency key', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true }])
	w.setSend((n) =>
		n === 1 ? { ok: false, reason: 'server_error', status: 503 } : { ok: true, id: 'm2' }
	)
	const summary = await runScheduler(w.deps())
	assert.equal(w.sends.length, 2)
	assert.equal(w.sends[0]?.idempotencyKey, w.sends[1]?.idempotencyKey)
	assert.equal(w.sends[0]?.idempotencyKey, emailIdempotencyKey('u1', DATE))
	assert.equal(w.slots.get('u1|2026-11-02')?.status, 'accepted')
	assert.equal(w.slots.get('u1|2026-11-02')?.attempts, 2)
	assert.equal(summary.email.accepted, 1)
})

test('a permanent rejection is recorded as failed and not retried', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true }])
	w.setSend(() => ({ ok: false, reason: 'rejected', status: 422 }))
	const summary = await runScheduler(w.deps())
	assert.equal(w.sends.length, 1)
	assert.equal(w.slots.get('u1|2026-11-02')?.status, 'failed')
	assert.equal(w.slots.get('u1|2026-11-02')?.lastError, 'rejected')
	assert.equal(summary.email.failed, 1)
})

test('a rate limit stops email for the rest of the run but leaves the slot retryable', async () => {
	const w = world([
		{ userId: 'u1', emailOptIn: true },
		{ userId: 'u2', emailOptIn: true }
	])
	w.setSend(() => ({ ok: false, reason: 'rate_limited', status: 429 }))
	const summary = await runScheduler(w.deps())
	assert.equal(w.sends.length, 1, 'the breaker stops the second send')
	assert.equal(summary.email.rateLimitedStop, true)
	assert.equal(w.notifications.size, 2, 'in-app continues regardless')
	const slot = [...w.slots.values()][0]
	assert.equal(slot?.status, 'retry')
})

test('attempts are bounded: an exhausted slot is never claimed again', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true }])
	w.setSend(() => ({ ok: false, reason: 'server_error', status: 500 }))
	for (let run = 0; run < 4; run += 1) await runScheduler(w.deps())
	assert.equal(w.sends.length, MAX_DELIVERY_ATTEMPTS)
	assert.equal(w.slots.get('u1|2026-11-02')?.status, 'failed')
	assert.equal(w.slots.get('u1|2026-11-02')?.attempts, MAX_DELIVERY_ATTEMPTS)
})

test('a crash after the provider accepted is recovered after the claim TTL, with the same idempotency key', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true }])
	w.setFailAccept(true)
	await runScheduler(w.deps())
	assert.equal(w.sends.length, 1)
	assert.equal(w.slots.get('u1|2026-11-02')?.status, 'claimed', 'left claimed by the crash')

	w.setFailAccept(false)
	// Within the TTL another run must not touch the slot (it may still be in flight).
	await runScheduler(w.deps({ now: new Date(NOW.getTime() + DELIVERY_CLAIM_TTL_MS / 2) }))
	assert.equal(w.sends.length, 1)

	// After the TTL it is reclaimed; the identical key lets Resend de-duplicate.
	await runScheduler(w.deps({ now: new Date(NOW.getTime() + DELIVERY_CLAIM_TTL_MS + 1) }))
	assert.equal(w.sends.length, 2)
	assert.equal(w.sends[0]?.idempotencyKey, w.sends[1]?.idempotencyKey)
	assert.equal(w.slots.get('u1|2026-11-02')?.status, 'accepted')
})

test('emailSlotOpen: new, retry and stale claims are open; fresh, done and exhausted are not', () => {
	const old = new Date(NOW.getTime() - DELIVERY_CLAIM_TTL_MS - 1).toISOString()
	const fresh = new Date(NOW.getTime() - 1000).toISOString()
	assert.equal(emailSlotOpen(null, NOW), true)
	assert.equal(emailSlotOpen({ status: 'retry', attempts: 1, claimedAt: fresh }, NOW), true)
	assert.equal(emailSlotOpen({ status: 'claimed', attempts: 1, claimedAt: old }, NOW), true)
	assert.equal(emailSlotOpen({ status: 'claimed', attempts: 1, claimedAt: fresh }, NOW), false)
	assert.equal(emailSlotOpen({ status: 'accepted', attempts: 1, claimedAt: old }, NOW), false)
	assert.equal(emailSlotOpen({ status: 'failed', attempts: 1, claimedAt: old }, NOW), false)
	assert.equal(
		emailSlotOpen({ status: 'retry', attempts: MAX_DELIVERY_ATTEMPTS, claimedAt: old }, NOW),
		false
	)
})

// --- independence and database failures ------------------------------------------

test('an in-app write failure does not stop the email, and vice versa', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true }])
	const summary = await runScheduler(
		w.deps({
			inApp: {
				async create() {
					throw new Error('learning_notifications does not exist')
				}
			}
		})
	)
	assert.equal(summary.inApp.failed, 1)
	assert.equal(summary.email.accepted, 1)

	const w2 = world([{ userId: 'u1', emailOptIn: true }])
	w2.setSend(() => ({ ok: false, reason: 'rejected' }))
	const s2 = await runScheduler(w2.deps())
	assert.equal(s2.email.failed, 1)
	assert.equal(w2.notifications.size, 1)
})

test('a planning failure for one learner does not stop the others', async () => {
	const w = world([{ userId: 'broken' }, { userId: 'fine' }])
	const summary = await runScheduler(
		w.deps({
			planFor: async (u) => {
				if (u === 'broken') throw new Error('db timeout')
				return REMINDER
			}
		})
	)
	assert.equal(summary.planErrors, 1)
	assert.ok(w.notifications.has('fine|daily:2026-11-02'))
})

test('no plan (e.g. an invalid problem reference) means no delivery on any channel', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true }])
	const summary = await runScheduler(w.deps({ planFor: async () => null }))
	assert.equal(summary.noPlan, 1)
	assert.equal(w.notifications.size, 0)
	assert.equal(w.sends.length, 0)
})

test('if the candidate query itself fails, the run rejects (the route reports a 5xx)', async () => {
	const w = world([])
	await assert.rejects(
		runScheduler(
			w.deps({
				candidates: async () => {
					throw new Error('database unavailable')
				}
			})
		)
	)
})

// --- bounded processing ----------------------------------------------------------

test('a run bounded by maxUsers reports truncated, and re-runs continue to completion', async () => {
	const w = world([{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }])
	const first = await runScheduler(w.deps({ maxUsers: 1 }))
	assert.equal(first.processed, 1)
	assert.equal(first.truncated, true)
	await runScheduler(w.deps({ maxUsers: 1 }))
	const third = await runScheduler(w.deps({ maxUsers: 1 }))
	assert.equal(w.notifications.size, 3, 'finished learners are skipped, so re-runs make progress')
	assert.equal(third.truncated, false)
})

test('past the deadline no new learner is started', async () => {
	const w = world([{ userId: 'a' }])
	const summary = await runScheduler(w.deps({ deadlineMs: 0, clock: () => 1 }))
	assert.equal(summary.processed, 0)
	assert.equal(summary.truncated, true)
	assert.equal(w.notifications.size, 0)
})

test('rotation is deterministic per date and covers everyone', () => {
	const ids = ['a', 'b', 'c', 'd']
	assert.deepEqual(rotateForDate(ids, DATE), rotateForDate(ids, DATE))
	assert.deepEqual([...rotateForDate(ids, DATE)].sort(), ids)
	assert.notDeepEqual(rotateForDate(ids, '2026-11-02'), rotateForDate(ids, '2026-11-03'))
	assert.deepEqual(rotateForDate([], DATE), [])
})

// --- zero OpenRouter / no Python -------------------------------------------------

test('the scheduler path imports nothing that can reach OpenRouter or run Python', () => {
	const files = [
		'src/server/notifications/scheduler.ts',
		'src/server/notifications/daily-reminders.ts',
		'src/server/api/learning-reminders-cron.ts',
		'src/lib/learning/reminder-plan.ts',
		'src/lib/notifications/email-template.ts'
	]
	// Module specifiers only (static and dynamic imports) — comments may say why.
	const specifiers = (source: string) =>
		[...source.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '')
	for (const file of files) {
		for (const spec of specifiers(readFileSync(file, 'utf8'))) {
			assert.doesNotMatch(
				spec,
				/openrouter|recommend-ai|pyodide|run-code|worker/i,
				`${file}: ${spec}`
			)
		}
		// …and no call to the AI refresh path.
		assert.doesNotMatch(
			readFileSync(file, 'utf8').replace(/\/\/.*$/gm, ''),
			/diagnoseRecommendation\(|refreshRecommendation\(|askOpenRouter\(/,
			file
		)
	}
	// The recommendation it does use is the deterministic read path.
	assert.match(
		readFileSync('src/server/notifications/daily-reminders.ts', 'utf8'),
		/recommendationForUser/
	)
})

test('end to end on real evidence: the deterministic pipeline yields a deliverable plan', async () => {
	const { evidence } = buildFor([att('a1', 0, 'fail', NESTED), att('a2', 4, 'fail', NESTED)])
	const catalog = Object.values(PROBLEMS).map((p) => ({
		slug: p.slug,
		title: p.title,
		conceptTags: p.conceptTags
	}))
	const w = world([{ userId: 'u1' }])
	await runScheduler(
		w.deps({
			planFor: async () => {
				const plan = planReminder(rankRecommendations(evidence), evidence, catalog, NOW)
				return plan == null ? null : { plan, problemTitle: PROBLEMS[plan.problemSlug]?.title ?? '' }
			}
		})
	)
	const stored = w.notifications.get('u1|daily:2026-11-02')
	assert.equal(stored?.problemSlug, 'two-sum')
	assert.ok(PROBLEMS[stored?.problemSlug ?? ''])
})

test('crash recovery re-sends the reminder frozen at the first claim, even if the plan changed', async () => {
	const w = world([{ userId: 'u1', emailOptIn: true }])
	w.setFailAccept(true)
	await runScheduler(w.deps())
	w.setFailAccept(false)
	// Between the crash and the recovery the learner practised: today's plan is now different.
	const changed: PlannedReminder = {
		plan: {
			...PLAN,
			template: 'new_problem',
			problemSlug: 'contains-duplicate',
			reasonCode: 'not_attempted'
		},
		problemTitle: 'Contains Duplicate'
	}
	await runScheduler(
		w.deps({
			now: new Date(NOW.getTime() + DELIVERY_CLAIM_TTL_MS + 1),
			planFor: async () => changed
		})
	)
	assert.equal(w.sends.length, 2)
	assert.equal(w.sends[0]?.idempotencyKey, w.sends[1]?.idempotencyKey)
	// Same key, same payload — so Resend can replay rather than reject.
	assert.deepEqual(w.sends[1]?.reminder, w.sends[0]?.reminder)
	assert.equal(w.sends[1]?.reminder.plan.problemSlug, 'two-sum')
})

// learning-recommendations AC19a: a previous opt-in cannot bypass release policy.
test('hackathon cron creates in-app reminders without sending or retrying email', async () => {
	const config = resolveReminderEmailConfig({
		RESEND_API_KEY: 'fixture',
		REMINDER_FROM_EMAIL: 'reminders@example.test',
		RESEND_VERIFIED_DOMAIN: 'example.test'
	})
	assert.equal(config.enabled, false)
	const w = world([
		{ userId: 'u1', emailOptIn: true },
		{ userId: 'u2', emailOptIn: true, inAppEnabled: false }
	])
	w.slots.set('u1|2026-11-02', {
		reminder: REMINDER,
		status: 'retry',
		attempts: 1,
		claimedAt: null,
		providerMessageId: null,
		lastError: 'network_error'
	})
	const summary = await runScheduler(w.deps({ email: config.enabled ? w.email : null }))
	assert.equal(summary.inApp.created, 1)
	assert.equal(w.notifications.size, 1)
	assert.equal(summary.email.configured, false)
	assert.equal(w.sends.length, 0)
	assert.equal(w.slots.size, 1)
	assert.equal(w.slots.get('u1|2026-11-02')?.attempts, 1)
})
