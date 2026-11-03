import { test, expect } from '@playwright/test'

// specs/features/oauth-sign-in.md, for what runs without real provider apps:
// buttons hidden while their flags are off (the default), and the failure path.
// A full Google/GitHub round trip needs real OAuth apps and is tested by hand.

test('AC2: with no provider switched on, sign-in and register show only the email form', async ({
	page
}) => {
	for (const path of ['/login', '/register']) {
		await page.goto(path)
		await expect(page.getByLabel('Email')).toBeVisible()
		await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0)
	}
})

test('AC4: a callback with no code goes back to sign-in with a message', async ({ page }) => {
	await page.goto('/api/auth/callback?provider=github&next=%2Fplans')
	await page.waitForURL((url) => url.pathname === '/login')
	await expect(
		page.getByText('Sign-in with GitHub was cancelled or failed. Try again or use email.')
	).toBeVisible()
})

test('AC4: an unknown provider in the error never echoes the raw value', async ({ page }) => {
	await page.goto('/login?oauth_error=%3Cscript%3E')
	await expect(page.getByText(/Sign-in with that provider was cancelled/)).toBeVisible()
	await expect(page.getByText('<script>')).toHaveCount(0)
})
