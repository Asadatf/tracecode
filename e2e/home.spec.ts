import { test, expect } from '@playwright/test'

// specs/features/home-page.md — the browser-level acceptance criteria. The
// data-level ones (AC4–AC8) are unit tests in src/lib/home/.

test('AC1: the home page shows the top bar, headline and calls to action', async ({ page }) => {
	await page.goto('/')
	const nav = page.getByRole('navigation', { name: 'Main' })
	await expect(nav.getByRole('link', { name: 'Problems' })).toBeVisible()
	await expect(nav.getByRole('link', { name: 'Progress' })).toBeVisible()
	await expect(
		page.getByRole('heading', { level: 1, name: 'Practice Python. When it fails, watch it run.' })
	).toBeVisible()
	await expect(page.getByRole('link', { name: 'Solve Two Sum' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'See all problems' })).toBeVisible()
	await expect(
		page.getByRole('figure', { name: 'A replay of a failing Two Sum solution' })
	).toBeVisible()
})

test('AC2: "Solve Two Sum" opens the Two Sum practice page', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('link', { name: 'Solve Two Sum' }).click()
	await expect(page).toHaveURL(/\/practice\/two-sum$/)
})

test('AC3: "See all problems" reaches the problem table; "Progress" opens /progress', async ({
	page
}) => {
	await page.goto('/')
	await page.getByRole('link', { name: 'See all problems' }).click()
	await expect(page).toHaveURL(/#problems$/)
	await expect(page.getByRole('heading', { level: 2, name: 'Problems' })).toBeInViewport()

	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Progress' })
		.click()
	await expect(page).toHaveURL(/\/progress$/)
})

test('AC6/AC8: a signed-out visitor sees every problem with an unknown status', async ({
	page
}) => {
	await page.goto('/')
	const table = page.locator('#problems table')
	await expect(table.getByRole('link', { name: 'Two Sum' })).toHaveAttribute(
		'href',
		'/practice/two-sum'
	)
	await expect(table.getByRole('link', { name: 'Contains Duplicate' })).toBeVisible()
	await expect(page.getByText('Sign in to track your progress.')).toBeVisible()
})

test('AC9: at phone width the page has no horizontal scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	)
	expect(overflow).toBe(0)
})
