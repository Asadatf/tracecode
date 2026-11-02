import { test, expect } from '@playwright/test'

// M7.5B browser checks that are safe against a shared database: every case here
// either renders without a query (signed out, malformed token) or is rejected
// before any handler runs (no cron secret). Nothing is clicked that would write.

test('a signed-out visitor sees no notification bell', async ({ page }) => {
	for (const path of ['/', '/progress']) {
		await page.goto(path)
		await expect(page.getByRole('button', { name: /Notifications/ })).toHaveCount(0)
	}
})

test('the unsubscribe page explains an invalid or missing link', async ({ page }) => {
	await page.goto('/unsubscribe')
	await expect(
		page.getByRole('heading', { level: 1, name: 'Unsubscribe from reminder emails' })
	).toBeVisible()
	await expect(page.getByText('This unsubscribe link isn’t valid.')).toBeVisible()
	await expect(page.getByRole('button', { name: 'Unsubscribe' })).toHaveCount(0)

	await page.goto('/unsubscribe?token=not-a-real-token') // allowlist secret: deliberately invalid fixture
	await expect(page.getByText('This unsubscribe link isn’t valid.')).toBeVisible()
})

test('a well-formed token asks for a confirming click (scanners cannot unsubscribe)', async ({
	page
}) => {
	await page.goto(`/unsubscribe?token=${'A'.repeat(43)}`)
	// Deliberately NOT clicked — that would query the shared database.
	await expect(page.getByRole('button', { name: 'Unsubscribe' })).toBeVisible()
})

test('the unsubscribe page is never indexed', async ({ page }) => {
	await page.goto('/unsubscribe')
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('one-click unsubscribe answers the same for a malformed token', async ({ request }) => {
	const response = await request.post('/api/notifications/unsubscribe?token=bad', {
		form: { 'List-Unsubscribe': 'One-Click' }
	})
	expect(response.status()).toBe(200)
	expect(await response.json()).toEqual({ ok: true })
})

test('the reminder cron rejects a request without the cron secret', async ({ request }) => {
	expect((await request.get('/api/cron/learning-reminders')).status()).toBe(401)
	const wrong = await request.get('/api/cron/learning-reminders', {
		headers: { authorization: 'Bearer wrong-secret' }
	})
	expect(wrong.status()).toBe(401)
})
