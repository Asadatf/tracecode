import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { REMINDER_EMAIL_ENABLED, resolveReminderEmailConfig } from './release-policy.ts'
import { resolveEmailConfig } from './email-config.ts'

const configured = {
	RESEND_API_KEY: 'fixture',
	REMINDER_FROM_EMAIL: 'reminders@example.test',
	RESEND_VERIFIED_DOMAIN: 'example.test'
}
const source = (path: string) =>
	readFileSync(new URL(path, import.meta.url), 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '')

test('AC19a: release policy disables reminder email even with valid configuration', () => {
	assert.equal(resolveEmailConfig(configured).enabled, true)
	assert.equal(REMINDER_EMAIL_ENABLED, false)
	for (const env of [{}, configured])
		assert.deepEqual(resolveReminderEmailConfig(env), {
			enabled: false,
			reason: 'release_disabled'
		})
})

test('AC19a: both production cron channels resolve release policy before creating any sender', () => {
	for (const file of ['daily-reminders', 'review-reminders']) {
		const wiring = source(`../../server/notifications/${file}.ts`)
		assert.match(
			wiring,
			/import \{ resolveReminderEmailConfig \} from '@\/lib\/notifications\/release-policy'/
		)
		assert.match(
			wiring,
			/function emailChannel\(\)[^{]+\{\s*const config = resolveReminderEmailConfig\(env\)\s*if \(!config.enabled\) return null/
		)
		assert.match(wiring, /email: emailChannel\(\)/)
		assert.doesNotMatch(wiring, /resolveEmailConfig/)
	}
	const cron = source('../../server/api/learning-reminders-cron.ts')
	assert.match(cron, /await runDailyReminders\(\)/)
	assert.match(cron, /await runReviewReminders\(\)/)
	assert.doesNotMatch(cron, /sendEmail|resend/)
})

test('AC23a: Settings has no reminder controls and production in-app reminders are always on', () => {
	const settings = source('../../app/[locale]/settings/page.tsx')
	assert.doesNotMatch(settings, /ReminderPreferences|getPreferences|emailOptIn|inAppEnabled/)
	for (const file of ['daily-reminders', 'review-reminders']) {
		const wiring = source(`../../server/notifications/${file}.ts`)
		assert.match(wiring, /inAppEnabled: true/)
		assert.doesNotMatch(wiring, /inAppEnabled: u\.notificationPreference/)
	}
	const daily = source('../../server/notifications/daily-reminders.ts')
	assert.doesNotMatch(daily, /where: \{\s*OR: \[/)
	const inbox = source('../../server/notifications/inbox.ts')
	assert.match(inbox, /resolveReminderEmailConfig\(env\)/)
})
