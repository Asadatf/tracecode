import test from 'node:test'
import assert from 'node:assert/strict'
import {
	runReviewScheduler,
	type ReviewCandidate,
	type ReviewEmailChannel,
	type ReviewSchedulerDeps
} from './review-scheduler.ts'
import type { DueItem } from '../../lib/reviews/review-reminder.ts'
import type { SendFailure, SendResult } from '../email/resend.ts'

const NOW = new Date('2026-11-12T15:00:00Z')
const due = (slug: string, done = 0, day = '2026-11-11'): DueItem => ({
	problemSlug: slug,
	reviewsDone: done,
	dueDay: day
})

function candidate(over: Partial<ReviewCandidate> = {}): ReviewCandidate {
	return {
		userId: 'u1',
		inAppEnabled: true,
		emailOptIn: false,
		email: 'u1@example.test',
		unsubscribeToken: 'tok',
		inAppDoneToday: false,
		emailSlot: null,
		due: [due('two-sum')],
		...over
	}
}

// A world the scheduler runs against: notifications keyed (user, key), delivery slots,
// reviews already announced, and which reviews are still pending.
function world(
	candidates: ReviewCandidate[],
	opts: { emailResults?: SendResult[]; email?: boolean } = {}
) {
	const notifications = new Set<string>()
	const reminded: string[] = []
	const sent: { to: string; key: string }[] = []
	const slots = new Map<string, { status: string; attempts: number; payload: unknown }>()
	const results = [...(opts.emailResults ?? [])]
	const pendingSlugs = new Set(candidates.flatMap((c) => c.due.map((d) => d.problemSlug)))
	const channel: ReviewEmailChannel = {
		async claim(userId, date, _now, reminder) {
			const k = `${userId}|${date}`
			const slot = slots.get(k)
			if (slot == null) {
				slots.set(k, { status: 'claimed', attempts: 1, payload: reminder })
				return { attempts: 1, reminder }
			}
			if (slot.status !== 'retry') return null
			slot.status = 'claimed'
			slot.attempts += 1
			return { attempts: slot.attempts, reminder: slot.payload as typeof reminder }
		},
		async send({ to, idempotencyKey }) {
			sent.push({ to, key: idempotencyKey })
			return results.shift() ?? { ok: true, id: `msg-${sent.length}` }
		},
		async markAccepted(u, d) {
			slots.get(`${u}|${d}`)!.status = 'accepted'
		},
		async markRetry(u, d) {
			slots.get(`${u}|${d}`)!.status = 'retry'
		},
		async markFailed(u, d) {
			slots.get(`${u}|${d}`)!.status = 'failed'
		},
		async markSkipped(u, d) {
			slots.get(`${u}|${d}`)!.status = 'skipped'
		}
	}
	const deps: ReviewSchedulerDeps = {
		now: NOW,
		deadlineMs: Number.MAX_SAFE_INTEGER,
		maxUsers: 100,
		candidates: async () => candidates,
		stillDue: async (_u, items) => items.filter((i) => pendingSlugs.has(i.problemSlug)),
		inApp: {
			async create(userId, key) {
				const k = `${userId}|${key}`
				if (notifications.has(k)) return false
				notifications.add(k)
				return true
			}
		},
		markReminded: async (userId, items) => {
			for (const i of items) reminded.push(`${userId}|${i.problemSlug}`)
		},
		email: opts.email === false ? null : channel
	}
	return { deps, notifications, reminded, sent, slots, pendingSlugs }
}

test('a learner with a due review gets one in-app notification and the review is marked announced', async () => {
	const w = world([candidate()], { email: false })
	const summary = await runReviewScheduler(w.deps)
	assert.deepEqual([...w.notifications], ['u1|review:2026-11-12'])
	assert.equal(summary.inApp.created, 1)
	assert.deepEqual(w.reminded, ['u1|two-sum'])
})

test('running again the same day creates nothing new', async () => {
	const w = world([candidate()], { email: false })
	await runReviewScheduler(w.deps)
	const again = await runReviewScheduler({
		...w.deps,
		candidates: async () => [candidate({ inAppDoneToday: true })]
	})
	assert.equal(w.notifications.size, 1)
	assert.equal(again.inApp.created, 0)
	assert.equal(again.inApp.duplicate, 1)
})

test('a concurrent second run is blocked by the unique key, not by luck', async () => {
	const w = world([candidate()], { email: false })
	const [a, b] = await Promise.all([runReviewScheduler(w.deps), runReviewScheduler(w.deps)])
	assert.equal(a.inApp.created + b.inApp.created, 1)
	assert.equal(w.notifications.size, 1)
})

test('in-app reminders off and no email opt-in: nothing is sent and nothing is marked', async () => {
	const w = world([candidate({ inAppEnabled: false, emailOptIn: false })])
	const summary = await runReviewScheduler(w.deps)
	assert.equal(w.notifications.size, 0)
	assert.equal(w.sent.length, 0)
	assert.deepEqual(w.reminded, [])
	assert.equal(summary.skipped, 1)
	assert.equal(summary.inApp.disabled, 1)
})

test('in-app off but email opted in: only the email is sent', async () => {
	const w = world([candidate({ inAppEnabled: false, emailOptIn: true })])
	const summary = await runReviewScheduler(w.deps)
	assert.equal(w.notifications.size, 0)
	assert.equal(w.sent.length, 1)
	assert.equal(summary.email.accepted, 1)
	assert.deepEqual(w.reminded, ['u1|two-sum'])
})

test('email is opt-in: an in-app-only learner is never emailed', async () => {
	const w = world([candidate({ emailOptIn: false })])
	const summary = await runReviewScheduler(w.deps)
	assert.equal(w.sent.length, 0)
	assert.equal(summary.email.notOptedIn, 1)
})

test('email not configured (development): in-app still works and it is not a failure', async () => {
	const w = world([candidate({ emailOptIn: true })], { email: false })
	const summary = await runReviewScheduler(w.deps)
	assert.equal(summary.email.configured, false)
	assert.equal(summary.email.failed, 0)
	assert.equal(summary.inApp.created, 1)
	assert.deepEqual(w.reminded, ['u1|two-sum'])
})

test('opted in with no address or token on file: no send, no failure', async () => {
	const w = world([candidate({ emailOptIn: true, email: null })])
	const summary = await runReviewScheduler(w.deps)
	assert.equal(summary.email.noAddress, 1)
	assert.equal(w.sent.length, 0)
})

test('email uses its own idempotency key and its own channel, separate from the daily one', async () => {
	const w = world([candidate({ emailOptIn: true })])
	await runReviewScheduler(w.deps)
	assert.equal(w.sent[0]?.key, 'review-reminder:u1:2026-11-12')
})

test('a retryable email failure leaves the review unannounced so the next run continues', async () => {
	const w = world([candidate({ emailOptIn: true, inAppEnabled: false })], {
		emailResults: [
			{ ok: false, reason: 'server_error' as SendFailure },
			{ ok: false, reason: 'server_error' as SendFailure }
		]
	})
	const first = await runReviewScheduler(w.deps)
	assert.equal(first.email.retry, 1)
	assert.deepEqual(w.reminded, [])
	assert.equal(w.slots.get('u1|2026-11-12')?.status, 'retry')

	// Next run: the slot is retryable, the provider accepts.
	const second = await runReviewScheduler({
		...w.deps,
		candidates: async () => [
			candidate({
				emailOptIn: true,
				inAppEnabled: false,
				emailSlot: { status: 'retry', attempts: 2, claimedAt: null }
			})
		]
	})
	assert.equal(second.email.accepted, 1)
	assert.deepEqual(w.reminded, ['u1|two-sum'])
})

test('a permanent email failure stops retrying and is recorded, not retried forever', async () => {
	const w = world([candidate({ emailOptIn: true, inAppEnabled: false })], {
		emailResults: [{ ok: false, reason: 'rejected' as SendFailure }]
	})
	const summary = await runReviewScheduler(w.deps)
	assert.equal(summary.email.failed, 1)
	assert.equal(w.slots.get('u1|2026-11-12')?.status, 'failed')
	assert.deepEqual(w.reminded, ['u1|two-sum'])
})

test('a review completed before a retry is not announced again', async () => {
	const w = world([candidate({ emailOptIn: true, inAppEnabled: false })], {
		emailResults: [
			{ ok: false, reason: 'server_error' as SendFailure },
			{ ok: false, reason: 'server_error' as SendFailure }
		]
	})
	await runReviewScheduler(w.deps)
	// The learner completes the review between runs.
	w.pendingSlugs.delete('two-sum')
	const second = await runReviewScheduler({
		...w.deps,
		candidates: async () => [
			candidate({
				emailOptIn: true,
				inAppEnabled: false,
				emailSlot: { status: 'retry', attempts: 2, claimedAt: null }
			})
		]
	})
	assert.equal(second.email.skipped, 1)
	assert.equal(second.email.accepted, 0)
	assert.equal(w.slots.get('u1|2026-11-12')?.status, 'skipped')
	assert.equal(w.sent.length, 2, 'no third send')
})

test('a provider rate limit stops emailing for the rest of the run', async () => {
	const w = world(
		[candidate({ userId: 'a', emailOptIn: true }), candidate({ userId: 'b', emailOptIn: true })],
		{ emailResults: [{ ok: false, reason: 'rate_limited' as SendFailure }] }
	)
	const summary = await runReviewScheduler(w.deps)
	assert.equal(summary.email.rateLimitedStop, true)
	assert.equal(w.sent.length, 1)
})

test('the run respects its user cap and reports truncation', async () => {
	const many = Array.from({ length: 5 }, (_, i) => candidate({ userId: `u${i}` }))
	const w = world(many, { email: false })
	const summary = await runReviewScheduler({ ...w.deps, maxUsers: 2 })
	assert.equal(summary.processed, 2)
	assert.equal(summary.truncated, true)
})

test('learners are isolated: each gets only their own reviews', async () => {
	const w = world(
		[
			candidate({ userId: 'a', due: [due('two-sum')] }),
			candidate({ userId: 'b', due: [due('binary-search')] })
		],
		{ email: false }
	)
	await runReviewScheduler(w.deps)
	assert.deepEqual(new Set(w.reminded), new Set(['a|two-sum', 'b|binary-search']))
})
