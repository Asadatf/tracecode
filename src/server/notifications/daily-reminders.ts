import 'server-only'
import { db, Prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import { log } from '@/server/lib/logger'
import { PROBLEMS } from '@/lib/trace/problems'
import { parseReminderPlan, planReminder, type ReminderPlan } from '@/lib/learning/reminder-plan'
import { resolveEmailConfig } from '@/lib/notifications/email-config'
import { renderReminderEmail } from '@/lib/notifications/email-template'
import { sendEmail } from '@/server/email/resend'
import { recommendationForUser } from '@/server/learning/recommendation'
import {
	DELIVERY_CLAIM_TTL_MS,
	MAX_DELIVERY_ATTEMPTS,
	dailyLogicalKey,
	runScheduler,
	utcDate,
	type Candidate,
	type EmailChannel,
	type PlannedReminder,
	type RunSummary
} from './scheduler'

// Production wiring for the daily reminder scheduler (M7.5B). Called only from
// the CRON_SECRET-guarded route. It never calls OpenRouter (recommendationForUser
// is the deterministic read path) and never runs Python. Every query is keyed by a
// user id the server itself iterated over — no request input selects a learner.

// Bounds for one invocation. Vercel Hobby gives a cron one daily invocation with
// a capped duration (see route `maxDuration`), so a run stops STARTING learners
// at the deadline and reports `truncated`; the run is idempotent, so a later
// invocation the same UTC day continues where it stopped.
const MAX_CANDIDATES = 5_000
const MAX_USERS_PER_RUN = 300
const RUN_BUDGET_MS = 45_000

const CATALOG = Object.values(PROBLEMS).map((p) => ({
	slug: p.slug,
	title: p.title,
	conceptTags: p.conceptTags
}))

function dateColumn(date: string): Date {
	return new Date(`${date}T00:00:00.000Z`)
}

function jsonIn(value: ReminderPlan | PlannedReminder): Prisma.InputJsonValue {
	return value as unknown as Prisma.InputJsonValue
}

// Reads a reminder frozen into a delivery slot. Null if absent or unreadable —
// the caller then falls back to the freshly planned one.
function frozenReminder(value: unknown): PlannedReminder | null {
	if (typeof value !== 'object' || value === null) return null
	const record = value as { plan?: unknown; problemTitle?: unknown }
	const plan = parseReminderPlan(record.plan)
	const title = typeof record.problemTitle === 'string' ? record.problemTitle : null
	return plan == null || title == null || title.length > 200 ? null : { plan, problemTitle: title }
}

async function candidates(date: string): Promise<Candidate[]> {
	const users = await db.user.findMany({
		// In-app defaults ON (no preference row = enabled); email is opt-in only.
		where: {
			OR: [
				{ notificationPreference: { is: null } },
				{ notificationPreference: { is: { inAppEnabled: true } } },
				{ notificationPreference: { is: { emailOptIn: true } } }
			]
		},
		select: {
			id: true,
			email: true,
			notificationPreference: {
				select: { inAppEnabled: true, emailOptIn: true, unsubscribeToken: true }
			},
			learningNotifications: {
				where: { logicalKey: dailyLogicalKey(date) },
				select: { id: true },
				take: 1
			},
			notificationDeliveries: {
				where: { deliveryDate: dateColumn(date), channel: 'email' },
				select: { status: true, attempts: true, claimedAt: true },
				take: 1
			}
		},
		orderBy: { id: 'asc' },
		take: MAX_CANDIDATES
	})
	return users.map((u) => ({
		userId: u.id,
		inAppEnabled: u.notificationPreference?.inAppEnabled ?? true,
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
					}
	}))
}

async function planFor(userId: string, now: Date) {
	const { evidence, recommendation } = await recommendationForUser(userId)
	const plan = planReminder(recommendation, evidence, CATALOG, now)
	if (plan == null) return null
	const problemTitle = PROBLEMS[plan.problemSlug]?.title
	return problemTitle == null ? null : { plan, problemTitle }
}

async function createInApp(
	userId: string,
	logicalKey: string,
	plan: ReminderPlan
): Promise<boolean> {
	// ON CONFLICT (userId, logicalKey) DO NOTHING: concurrent or repeated runs
	// insert the day's notification at most once.
	const { count } = await db.learningNotification.createMany({
		data: [{ userId, logicalKey, kind: 'daily_reminder', payload: jsonIn(plan) }],
		skipDuplicates: true
	})
	return count === 1
}

function emailChannel(): EmailChannel | null {
	const config = resolveEmailConfig(env)
	if (!config.enabled) return null
	const key = (userId: string, date: string) => ({
		userId,
		deliveryDate: dateColumn(date),
		channel: 'email'
	})
	return {
		async claim(userId, date, now, reminder) {
			// 1. First claim of the day: atomic insert, ON CONFLICT DO NOTHING. The
			//    reminder is frozen into the slot here.
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
			// 2. Reclaim a retryable row, or a 'claimed' row whose run crashed — only
			//    while attempts remain. One conditional UPDATE, so of two concurrent
			//    runs exactly one matches.
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
				reminder: frozenReminder(row?.payload) ?? reminder
			}
		},
		async send({ to, reminder, unsubscribeToken, idempotencyKey }) {
			const message = renderReminderEmail({
				plan: reminder.plan,
				problemTitle: reminder.problemTitle,
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
		}
	}
}

/** One daily run. Never throws past the route; returns counts only (no PII). */
export async function runDailyReminders(now: Date = new Date()): Promise<RunSummary> {
	const startedAt = Date.now()
	const summary = await runScheduler({
		now,
		deadlineMs: startedAt + RUN_BUDGET_MS,
		maxUsers: MAX_USERS_PER_RUN,
		candidates: () => candidates(utcDate(now)),
		planFor: (userId) => planFor(userId, now),
		inApp: { create: createInApp },
		email: emailChannel()
	})
	// Counts and enums only — never an address, id list, or message content.
	log.info('learning reminders run', {
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
		durationMs: Date.now() - startedAt
	})
	return summary
}
