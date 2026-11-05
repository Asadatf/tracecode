import 'server-only'
import { NextResponse } from 'next/server'
import { createCronRoute } from './route-factory'
import { captureError } from '@/lib/observability/capture-error'
import { runDailyReminders } from '@/server/notifications/daily-reminders'
import { runReviewReminders } from '@/server/notifications/review-reminders'

// GET /api/cron/learning-reminders — the single daily scheduler run: the M7.5B daily
// suggestion, then the M9C due-review reminders.
// CRON_SECRET-guarded (createCronRoute); returns counts only, never addresses or
// ids. Idempotent: re-invoking it on the same UTC day continues a truncated run
// and re-sends nothing already accepted. Makes no OpenRouter call.
export const learningRemindersCron = createCronRoute(async () => {
	try {
		const daily = await runDailyReminders()
		// Due-review reminders (M9C) run after the daily suggestion, in the same single
		// cron slot, and fail independently: a problem here never hides the daily run.
		let reviews: Awaited<ReturnType<typeof runReviewReminders>> | { error: string }
		try {
			reviews = await runReviewReminders()
		} catch (error) {
			captureError(error, { area: 'review-reminders-cron' })
			reviews = { error: 'Review reminder run failed' }
		}
		return NextResponse.json({ ...daily, reviews })
	} catch (error) {
		const { status } = captureError(error, { area: 'learning-reminders-cron' })
		return NextResponse.json({ error: 'Reminder run failed' }, { status })
	}
})
