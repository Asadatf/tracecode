import 'server-only'
import { NextResponse } from 'next/server'
import { createCronRoute } from './route-factory'
import { captureError } from '@/lib/observability/capture-error'
import { runDailyReminders } from '@/server/notifications/daily-reminders'

// GET /api/cron/learning-reminders — the single daily M7.5B scheduler run.
// CRON_SECRET-guarded (createCronRoute); returns counts only, never addresses or
// ids. Idempotent: re-invoking it on the same UTC day continues a truncated run
// and re-sends nothing already accepted. Makes no OpenRouter call.
export const learningRemindersCron = createCronRoute(async () => {
	try {
		return NextResponse.json(await runDailyReminders())
	} catch (error) {
		const { status } = captureError(error, { area: 'learning-reminders-cron' })
		return NextResponse.json({ error: 'Reminder run failed' }, { status })
	}
})
