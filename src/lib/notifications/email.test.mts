import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveEmailConfig } from './email-config.ts'
import { renderReminderEmail } from './email-template.ts'
import type { ReminderPlan } from '../learning/reminder-plan.ts'

// M7.5B — sending is gated by configuration alone, and the email says exactly
// what the plan says, with working links and nothing private in it.

const FULL = {
	RESEND_API_KEY: 're_test_key',
	REMINDER_FROM_EMAIL: 'reminders@mail.tracecode.dev',
	RESEND_VERIFIED_DOMAIN: 'mail.tracecode.dev'
}

test('missing Resend configuration disables email, whatever else is set', () => {
	assert.deepEqual(resolveEmailConfig({}), { enabled: false, reason: 'no_api_key' })
	assert.deepEqual(resolveEmailConfig({ ...FULL, RESEND_API_KEY: '  ' }), {
		enabled: false,
		reason: 'no_api_key'
	})
	assert.deepEqual(resolveEmailConfig({ ...FULL, REMINDER_FROM_EMAIL: '' }), {
		enabled: false,
		reason: 'no_sender'
	})
})

test('an API key alone (e.g. in a developer .env.local) never enables sending', () => {
	assert.equal(resolveEmailConfig({ RESEND_API_KEY: 're_live_key' }).enabled, false)
})

test('the sender must be a plain address on exactly the declared verified domain', () => {
	assert.equal(
		resolveEmailConfig({ ...FULL, REMINDER_FROM_EMAIL: 'TraceCode <a@mail.tracecode.dev>' })
			.enabled,
		false
	)
	assert.deepEqual(resolveEmailConfig({ ...FULL, RESEND_VERIFIED_DOMAIN: '' }), {
		enabled: false,
		reason: 'unverified_domain'
	})
	assert.deepEqual(resolveEmailConfig({ ...FULL, REMINDER_FROM_EMAIL: 'a@gmail.com' }), {
		enabled: false,
		reason: 'unverified_domain'
	})
	assert.equal(
		resolveEmailConfig({ ...FULL, REMINDER_FROM_EMAIL: 'a@evil-mail.tracecode.dev' }).enabled,
		false,
		'a different subdomain is not the verified domain'
	)
	assert.deepEqual(resolveEmailConfig({ ...FULL, RESEND_VERIFIED_DOMAIN: 'MAIL.TraceCode.dev' }), {
		enabled: true,
		apiKey: 're_test_key',
		from: 'reminders@mail.tracecode.dev'
	})
})

const PLAN: ReminderPlan = {
	v: 1,
	template: 'unfinished',
	problemSlug: 'two-sum',
	reasonCode: 'open_repeated_failures',
	conceptTag: 'arrays',
	inactiveDays: null
}
const TOKEN = 'A'.repeat(40) + '-_x'

test('the email carries the problem, reason, concept, practice link and unsubscribe link', () => {
	const email = renderReminderEmail({
		plan: PLAN,
		problemTitle: 'Two Sum',
		appUrl: 'https://tracecode.dev',
		unsubscribeToken: TOKEN
	})
	assert.equal(email.subject, 'Two Sum is still in progress')
	assert.equal(email.practiceUrl, 'https://tracecode.dev/practice/two-sum')
	assert.equal(email.unsubscribeUrl, `https://tracecode.dev/unsubscribe?token=${TOKEN}`)
	assert.equal(
		email.oneClickUrl,
		`https://tracecode.dev/api/notifications/unsubscribe?token=${TOKEN}`
	)
	for (const body of [email.text, email.html]) {
		assert.ok(body.includes('Two Sum'))
		assert.ok(body.includes('didn’t pass every test'))
		assert.ok(body.includes('Concept to focus on: arrays'))
		assert.ok(body.includes('https://tracecode.dev/practice/two-sum'))
		assert.ok(body.includes(`/unsubscribe?token=${TOKEN}`))
	}
})

test('a trailing slash on the app URL still yields correct links', () => {
	const email = renderReminderEmail({
		plan: PLAN,
		problemTitle: 'Two Sum',
		appUrl: 'https://tracecode.dev/',
		unsubscribeToken: TOKEN
	})
	assert.equal(email.practiceUrl, 'https://tracecode.dev/practice/two-sum')
})

test('everything interpolated into the HTML is escaped', () => {
	const email = renderReminderEmail({
		plan: PLAN,
		problemTitle: '<script>alert(1)</script>',
		appUrl: 'https://tracecode.dev',
		unsubscribeToken: TOKEN
	})
	assert.ok(!email.html.includes('<script>'))
	assert.ok(email.html.includes('&lt;script&gt;'))
})

test('the email contains no source code, traces or identifiers beyond the plan', () => {
	const email = renderReminderEmail({
		plan: PLAN,
		problemTitle: 'Two Sum',
		appUrl: 'https://tracecode.dev',
		unsubscribeToken: TOKEN
	})
	assert.doesNotMatch(email.text, /def |return |nums\[|testsPassed|attempt id|@/)
})
