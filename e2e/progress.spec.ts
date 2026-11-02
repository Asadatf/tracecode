import { test, expect } from '@playwright/test'

// specs/features/progress-page.md + auth-access.md AC4. /progress is personal,
// so a signed-out request is redirected to Sign In (with a safe return path)
// before anything is read. The signed-in views (AC4–AC7 there) are unit tests
// in src/lib/progress/.

test('a signed-out request to /progress redirects to Sign In and exposes no progress data', async ({
	page
}) => {
	await page.goto('/progress')
	await expect(page).toHaveURL('/login?next=%2Fprogress')
	await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
	await expect(page.getByRole('heading', { name: 'Your progress' })).toHaveCount(0)
	await expect(page.getByRole('table')).toHaveCount(0)
})

test('at phone width the sign-in page has no horizontal scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/progress')
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	)
	expect(overflow).toBe(0)
})
