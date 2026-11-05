import 'server-only'
import { db, Prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import { log } from '@/server/lib/logger'
import { PROBLEMS } from '@/lib/trace/problems'
import { resolveReminderEmailConfig } from '@/lib/notifications/release-policy'
import { renderReviewEmail } from '@/lib/notifications/email-template'
import { sendEmail } from '@/server/email/resend'
import {
	REVIEW_EMAIL_CHANNEL,
	REVIEW_REMINDER_KIND,
	parseReviewReminder,
	reviewLogicalKey,
	type DueItem,
	type ReviewReminder
} from '@/lib/reviews/review-reminder'
import { dayColumn, markRemindedQuery, unremindedDueQuery } from '@/lib/reviews/review-queries'
import { DELIVERY_CLAIM_TTL_MS, MAX_DELIVERY_ATTEMPTS } from './scheduler'
import {
	runReviewScheduler,
	type ReviewCandidate,
	type ReviewEmailChannel,
	type ReviewRunSummary
} from './review-scheduler'

// Production wiring for the due-review reminder run (M9C). Called from the same
// CRON_SECRET-guarded route as the daily reminders, after them. Every query is keyed
// by a user id the server itself iterated over — no request input selects a learner —
// and it makes no AI call and runs no Python.

const MAX_DUE_ROWS = 5_000
const MAX_USERS_PER_RUN = 300
// The cron route has 60 s in total and the daily run may use up to 45 of them.
const RUN_BUDGET_MS = 10_000

const TITLES: Record<string, string> = Object.fromEntries(
	Object.values(PROBLEMS).map((p) => [p.slug, p.title])
)
const CONCEPTS: Record<string, string | undefined> = Object.fromEntries(
	Object.values(PROBLEMS).map((p) => [p.slug, p.conceptTags[0]])
)

function jsonIn(value: ReviewReminder): Prisma.InputJsonValue {
	return value as unknown as Prisma.InputJsonValue
}

async function candidates(date: string): Promise<ReviewCandidate[]> {
	const rows = await db.problemReview.findMany(unremindedDueQuery(date, MAX_DUE_ROWS))
	const byUser = new Map<string, DueItem[]>()
	for (const row of rows) {
		// A problem the catalogue no longer has can't be announced.
		if (!Object.hasOwn(PROBLEMS, row.problemSlug)) continue
		const items = byUser.get(row.userId) ?? []
		items.push({
			problemSlug: row.problemSlug,
			reviewsDone: row.reviewsDone,
			dueDay: row.dueDay.toISOString().slice(0, 10)
		})
		byUser.set(row.userId, items)
	}
	if (byUser.size === 0) return []

	const users = await db.user.findMany({
		where: { id: { in: [...byUser.keys()] } },
		select: {
			id: true,
			email: true,
			notificationPreference: {
				select: { inAppEnabled: true, emailOptIn: true, unsubscribeToken: true }
			},
			learningNotifications: {
				where: { logicalKey: reviewLogicalKey(date) },
				select: { id: true },
				take: 1
			},
			notificationDeliveries: {
				where: { deliveryDate: dayColumn(date), channel: REVIEW_EMAIL_CHANNEL },
				select: { status: true, attempts: true, claimedAt: true },
				take: 1
			}
		}
	})
	return users.map((u) => ({
		userId: u.id,
		inAppEnabled: true, // In-app reminders are always active for this release.
		emailOptIn: u.notificationPreference?.emailOptIn ?? false,
		email: u.notificationPreference == null || u.email === '' ? null : u.email,
		unsubscribeToken: u.notificationPreference?.unsubscribeToken ?? null,
		inAppDoneToday: u.learningNotifications.length > 0,
		emailSlot:
			u.notificationDeliveries[0] == null
				? null
				: {
						status: u.notificationDeliveries[0].status,
						attempts: u.notificationDeliveries[0].attempts,
						claimedAt: u.notificationDeliveries[0].claimedAt?.toISOString() ?? null
					},
		due: byUser.get(u.id) ?? []
	}))
}

async function createInApp(
	userId: string,
	logicalKey: string,
	reminder: ReviewReminder
): Promise<boolean> {
	// ON CONFLICT (userId, logicalKey) DO NOTHING: repeated or concurrent runs insert
	// the day's review notification at most once.
	const { count } = await db.learningNotification.createMany({
		data: [{ userId, logicalKey, kind: REVIEW_REMINDER_KIND, payload: jsonIn(reminder) }],
		skipDuplicates: true
	})
	return count === 1
}

// Of these, the reviews that are still pending, at the same stage, and due today.
async function stillDue(
	userId: string,
	items: readonly DueItem[],
	today: string
): Promise<DueItem[]> {
	if (items.length === 0) return []
	const rows = await db.problemReview.findMany({
		where: {
			userId,
			problemSlug: { in: items.map((i) => i.problemSlug) },
			completedAt: null,
			dueDay: { lte: dayColumn(today) }
		},
		select: { problemSlug: true, reviewsDone: true }
	})
	return items.filter((item) =>
		rows.some((r) => r.problemSlug === item.problemSlug && r.reviewsDone === item.reviewsDone)
	)
}

async function markReminded(userId: string, items: readonly DueItem[], at: Date): Promise<void> {
	for (const item of items) {
		await db.problemReview.updateMany(
			markRemindedQuery(userId, item.problemSlug, item.reviewsDone, at)
		)
	}
}

function emailChannel(): ReviewEmailChannel | null {
	const config = resolveReminderEmailConfig(env)
	// Release-disabled or unconfigured email is skipped without affecting in-app reminders.
	if (!config.enabled) return null
	const key = (userId: string, date: string) => ({
		userId,
		deliveryDate: dayColumn(date),
		channel: REVIEW_EMAIL_CHANNEL
	})
	return {
		async claim(userId, date, now, reminder) {
			const inserted = await db.notificationDelivery.createMany({
				data: [
					{
						...key(userId, date),
						status: 'claimed',
						attempts: 1,
						claimedAt: now,
						payload: jsonIn(reminder)
					}
				],
				skipDuplicates: true
			})
			if (inserted.count === 1) return { attempts: 1, reminder }
			const cutoff = new Date(now.getTime() - DELIVERY_CLAIM_TTL_MS)
			const reclaimed = await db.notificationDelivery.updateMany({
				where: {
					...key(userId, date),
					attempts: { lt: MAX_DELIVERY_ATTEMPTS },
					OR: [{ status: 'retry' }, { status: 'claimed', claimedAt: { lt: cutoff } }]
				},
				data: { status: 'claimed', claimedAt: now, attempts: { increment: 1 } }
			})
			if (reclaimed.count !== 1) return null
			const row = await db.notificationDelivery.findUnique({
				where: { userId_deliveryDate_channel: key(userId, date) },
				select: { attempts: true, payload: true }
			})
			return {
				attempts: row?.attempts ?? MAX_DELIVERY_ATTEMPTS,
				reminder: parseReviewReminder(row?.payload) ?? reminder
			}
		},
		async send({ to, reminder, unsubscribeToken, idempotencyKey }) {
			const message = renderReviewEmail({
				reminder,
				titles: TITLES,
				concepts: CONCEPTS,
				appUrl: env.NEXT_PUBLIC_APP_URL,
				unsubscribeToken
			})
			return sendEmail(config.apiKey, {
				from: config.from,
				to,
				subject: message.subject,
				html: message.html,
				text: message.text,
				idempotencyKey,
				headers: {
					'List-Unsubscribe': `<${message.oneClickUrl}>`,
					'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
				}
			})
		},
		async markAccepted(userId, date, providerMessageId) {
			await db.notificationDelivery.updateMany({
				where: key(userId, date),
				data: { status: 'accepted', providerMessageId, lastError: null }
			})
		},
		async markRetry(userId, date, code) {
			await db.notificationDelivery.updateMany({
				where: key(userId, date),
				data: { status: 'retry', lastError: code }
			})
		},
		async markFailed(userId, date, code) {
			await db.notificationDelivery.updateMany({
				where: key(userId, date),
				data: { status: 'failed', lastError: code }
			})
		},
		async markSkipped(userId, date, code) {
			await db.notificationDelivery.updateMany({
				where: key(userId, date),
				data: { status: 'skipped', lastError: code }
			})
		}
	}
}

/** One review-reminder run. Never throws past the route; returns counts only (no PII). */
export async function runReviewReminders(now: Date = new Date()): Promise<ReviewRunSummary> {
	const startedAt = Date.now()
	const today = now.toISOString().slice(0, 10)
	const summary = await runReviewScheduler({
		now,
		deadlineMs: startedAt + RUN_BUDGET_MS,
		maxUsers: MAX_USERS_PER_RUN,
		candidates: () => candidates(today),
		stillDue: (userId, items) => stillDue(userId, items, today),
		inApp: { create: createInApp },
		markReminded,
		email: emailChannel()
	})
	log.info('review reminders run', {
		date: summary.date,
		candidates: summary.candidates,
		processed: summary.processed,
		skipped: summary.skipped,
		truncated: summary.truncated,
		inAppCreated: summary.inApp.created,
		inAppFailed: summary.inApp.failed,
		emailConfigured: summary.email.configured,
		emailAccepted: summary.email.accepted,
		emailFailed: summary.email.failed,
		emailRetry: summary.email.retry,
		reminded: summary.reminded,
		durationMs: Date.now() - startedAt
	})
	return summary
}
