import { test, expect } from '@playwright/test'
import { openAsLearner } from './helpers/auth'

test('settings-navigation AC3: guests are redirected before account data renders', async ({
	page
}) => {
	await page.goto('/settings')
	await expect(page).toHaveURL('/login?next=%2Fsettings')
	await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(0)
	await expect(page.getByRole('checkbox')).toHaveCount(0)
})

test('settings-navigation AC1–AC4: shared header, keyboard account menu and read-only email', async ({
	page
}) => {
	await openAsLearner(page, '/settings')
	await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
	await expect(page.getByLabel('Email address', { exact: true })).toHaveAttribute('readonly', '')
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
	const account = page.getByRole('button', { name: 'Your account' })
	await account.focus()
	await page.keyboard.press('Enter')
	await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeFocused()
	await page.keyboard.press('Escape')
	await expect(account).toBeFocused()
	await expect(page.getByRole('menu')).toHaveCount(0)
	await account.click()
	await page.getByRole('heading', { name: 'Settings', exact: true }).click({ force: true })
	await expect(page.getByRole('menu')).toHaveCount(0)
	for (const path of ['/', '/progress', '/settings']) {
		await page.goto(path)
		await expect(
			page
				.getByRole('navigation', { name: 'Main navigation' })
				.getByRole('link', { name: 'Problems', exact: true })
		).toBeVisible()
		await expect(page.getByRole('button', { name: 'Your account' })).toBeVisible()
	}
})

for (const width of [1440, 1280, 768, 390]) {
	test(
		'settings-navigation AC7: signed-in pages and panels fit at ' + width + 'px',
		async ({ page }) => {
			await page.setViewportSize({ width, height: 960 })
			await openAsLearner(page, '/settings')
			for (const path of ['/settings', '/progress']) {
				await page.goto(path)
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
					true
				)
				await page.getByRole('button', { name: 'Your account' }).click()
				const bounds = await page.getByRole('menu').boundingBox()
				expect(bounds).not.toBeNull()
				expect(bounds!.x).toBeGreaterThanOrEqual(0)
				expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
				await page.keyboard.press('Escape')
			}
		}
	)
}

test('progress AC11–AC14: all sixteen problems and preferences relocated', async ({ page }) => {
	await openAsLearner(page, '/progress')
	await expect(page.getByRole('heading', { name: 'Your progress', exact: true })).toBeVisible()
	await expect(page.getByRole('heading', { name: 'What to practice next' })).toBeVisible()
	await expect(page.locator('section[aria-labelledby="progress-problems"] tbody tr')).toHaveCount(
		16
	)
	await expect(page.getByRole('checkbox')).toHaveCount(0)
	await page.getByRole('link', { name: 'Manage notifications' }).click()
	await expect(page).toHaveURL('/settings')
	await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible()
	await expect(page.getByText('Daily', { exact: true })).toBeVisible()
})
