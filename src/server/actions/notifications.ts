'use server'

import { z } from 'zod'
import { validatedAction } from './validated-action'
import {
	getInbox,
	getPreferences,
	markAllRead,
	markRead,
	unsubscribeByToken,
	updatePreferences
} from '@/server/notifications/inbox'

// Server Actions for the notification bell, the reminder preferences and the
// unsubscribe page (M7.5B). Thin shells: none takes a user id — the learner comes
// from the session inside inbox.ts — and none can create a notification.

export const listNotificationsAction = validatedAction({
	input: z.unknown(),
	handler: async () => getInbox()
})

export const markNotificationReadAction = validatedAction({
	input: z.object({ id: z.string().uuid() }),
	handler: async ({ id }) => markRead(id)
})

export const markAllNotificationsReadAction = validatedAction({
	input: z.unknown(),
	handler: async () => markAllRead()
})

export const getNotificationPreferencesAction = validatedAction({
	input: z.unknown(),
	handler: async () => getPreferences()
})

export const updateNotificationPreferencesAction = validatedAction({
	input: z
		.object({ inAppEnabled: z.boolean().optional(), emailOptIn: z.boolean().optional() })
		.strict(),
	handler: async (input) => updatePreferences(input)
})

export const unsubscribeEmailAction = validatedAction({
	input: z.object({ token: z.string().max(200) }),
	handler: async ({ token }) => unsubscribeByToken(token)
})
