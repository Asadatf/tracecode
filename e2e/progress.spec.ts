import { test, expect } from '@playwright/test'

// specs/features/progress-page.md — browser-level criteria. Sign-in doesn't
// exist yet, so every visitor gets the signed-out state (AC2); the signed-in
// views (AC4–AC7) are unit tests in src/lib/progress/.

test('AC1: the top bar marks Progress as the current page', async ({ page }) => {
	await page.goto('/progress')
	const nav = page.getByRole('navigation', { name: 'Main' })
	await expect(nav.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
	await expect(page.getByRole('heading', { level: 1, name: 'Your progress' })).toBeVisible()
})

test('AC2: a signed-out visitor sees what to do instead of an empty page', async ({ page }) => {
	await page.goto('/progress')
	await expect(page.getByRole('heading', { level: 2, name: 'Nothing saved yet' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Solve Two Sum' })).toHaveAttribute(
		'href',
		'/practice/two-sum'
	)
	await expect(page.getByRole('link', { name: 'See all problems' })).toHaveAttribute(
		'href',
		'/#problems'
	)
	await expect(page.getByRole('table')).toHaveCount(0)
})

test('AC8: at phone width the page has no horizontal scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/progress')
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	)
	expect(overflow).toBe(0)
})
