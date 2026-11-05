import 'server-only'
import { db } from '@/server/db/client'
import { env } from '@/lib/env'
import { captureError } from '@/lib/observability/capture-error'
import { currentLearnerId, currentUserIdSafe } from '@/server/auth/session'
import { resolveReminderEmailConfig } from '@/lib/notifications/release-policy'
import {
	isWellFormedUnsubscribeToken,
	listNotificationsQuery,
	markAllReadQuery,
	markReadQuery,
	toNotificationView,
	unreadCountQuery,
	unsubscribeQuery,
	upsertPreferencesQuery,
	type NotificationView,
	type PreferenceInput
} from '@/lib/notifications/queries'
import { newUnsubscribeToken } from './tokens'

// The learner-facing side of M7.5B notifications. Every function resolves the
// learner from the validated session — never from its arguments — and every query
// is built by a queries.ts builder that puts that id in the WHERE clause. They
// degrade like the other learning loaders: signed out → authenticated:false;
// tables not migrated / DB down → available:false; never throw into the UI.
// None of them creates a notification: only the daily scheduler does.

export type InboxView =
	| { authenticated: false; available: false; items: []; unreadCount: 0 }
	| { authenticated: true; available: false; items: []; unreadCount: 0 }
	| { authenticated: true; available: true; items: NotificationView[]; unreadCount: number }

export async function getInbox(): Promise<InboxView> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { authenticated: false, available: false, items: [], unreadCount: 0 }
	try {
		const [rows, unreadCount] = await Promise.all([
			db.learningNotification.findMany(listNotificationsQuery(userId)),
			db.learningNotification.count(unreadCountQuery(userId))
		])
		return {
			authenticated: true,
			available: true,
			items: rows.map(toNotificationView),
			unreadCount
		}
	} catch (error) {
		captureError(error, { area: 'notifications-inbox' })
		return { authenticated: true, available: false, items: [], unreadCount: 0 }
	}
}

// Just the badge number, for the header. Null = signed out or unavailable (the
// bell then renders without a count rather than failing the page).
export async function getUnreadCount(): Promise<{ authenticated: boolean; count: number | null }> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { authenticated: false, count: null }
	try {
		return {
			authenticated: true,
			count: await db.learningNotification.count(unreadCountQuery(userId))
		}
	} catch {
		return { authenticated: true, count: null }
	}
}

export async function markRead(notificationId: string): Promise<{ updated: boolean }> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { updated: false }
	const { count } = await db.learningNotification.updateMany(
		markReadQuery(userId, notificationId, new Date())
	)
	return { updated: count === 1 }
}

export async function markAllRead(): Promise<{ updated: number }> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { updated: 0 }
	const { count } = await db.learningNotification.updateMany(markAllReadQuery(userId, new Date()))
	return { updated: count }
}

export type PreferencesView =
	| { authenticated: false; available: false }
	| { authenticated: true; available: false }
	| {
			authenticated: true
			available: true
			inAppEnabled: boolean
			emailOptIn: boolean
			// Whether email can actually be sent here (sender + verified domain set).
			emailConfigured: boolean
	  }

export async function getPreferences(): Promise<PreferencesView> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { authenticated: false, available: false }
	try {
		const row = await db.notificationPreference.findUnique({
			where: { userId },
			select: { inAppEnabled: true, emailOptIn: true }
		})
		return {
			authenticated: true,
			available: true,
			inAppEnabled: row?.inAppEnabled ?? true,
			emailOptIn: row?.emailOptIn ?? false,
			emailConfigured: resolveReminderEmailConfig(env).enabled
		}
	} catch {
		return { authenticated: true, available: false }
	}
}

export async function updatePreferences(input: PreferenceInput): Promise<{ saved: boolean }> {
	// A write: currentLearnerId also ensures the users row exists (FK).
	const userId = await currentLearnerId()
	if (userId == null) return { saved: false }
	await db.notificationPreference.upsert(
		upsertPreferencesQuery(userId, newUnsubscribeToken(), input)
	)
	return { saved: true }
}

// No session: the token is the authorisation. The response is the same whether
// or not the token matched, so it can't be used to probe for valid tokens.
export async function unsubscribeByToken(token: unknown): Promise<{ done: true }> {
	if (!isWellFormedUnsubscribeToken(token)) return { done: true }
	await db.notificationPreference.updateMany(unsubscribeQuery(token))
	return { done: true }
}
