import { test, expect } from '@playwright/test'

// Navigation cleanup (specs/features/streak.md AC1–AC2). /progress is retired:
// old links land on Overview, which sends a signed-out visitor to Sign In, and no
// progress data is exposed on the way.

test('a signed-out request to the retired /progress route ends at Sign In, with no progress data', async ({
	page
}) => {
	await page.goto('/progress')
	await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/)
	await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
	await expect(page.getByRole('heading', { name: 'Your progress' })).toHaveCount(0)
	await expect(page.getByRole('table')).toHaveCount(0)
})

test('at phone width the redirect lands on a page with no horizontal scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/progress')
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	)
	expect(overflow).toBe(0)
})
