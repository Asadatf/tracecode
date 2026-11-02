import { test, expect } from '@playwright/test'

// specs/features/home-page.md — the browser-level acceptance criteria. The
// data-level ones (AC5–AC8) are unit tests in src/lib/home/.

test('AC1: the home page shows the top bar, headline and calls to action', async ({ page }) => {
	await page.goto('/')
	const nav = page.getByRole('navigation', { name: 'Main' })
	await expect(nav.getByRole('link', { name: 'Problems' })).toBeVisible()
	// Signed out: separate Sign In / Register, and no learner navigation.
	await expect(nav.getByRole('link', { name: 'Progress' })).toHaveCount(0)
	await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
		'href',
		'/login'
	)
	await expect(page.getByRole('link', { name: 'Register', exact: true })).toHaveAttribute(
		'href',
		'/register'
	)
	await expect(
		page.getByRole('heading', { level: 1, name: 'Practice Python. When it fails, watch it run.' })
	).toBeVisible()
	await expect(page.getByRole('link', { name: 'Solve Two Sum' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'See all problems' })).toBeVisible()
	await expect(page.getByRole('region', { name: 'See the state change' })).toBeVisible()
})

test('AC4/AC5: the fixture-backed guided tour supports every stage and control', async ({
	page
}) => {
	await page.goto('/')
	const tour = page.getByRole('region', { name: 'See the state change' })
	await expect(tour.getByText('Illustrative · not live Python')).toBeVisible()
	await expect(tour.getByText('two_sum([3, 2, 4], 6)')).toBeVisible()

	await tour.getByRole('button', { name: 'Run', exact: true }).last().click()
	await expect(tour.getByText('[1, 2]', { exact: true })).toBeVisible()
	await expect(tour.getByText('[0, 0]', { exact: true })).toBeVisible()

	await tour.getByRole('button', { name: /Explore/ }).click()
	await tour.getByRole('button', { name: /Next/ }).click()
	await tour.getByRole('button', { name: /Next/ }).click()
	await tour.getByRole('button', { name: /Next/ }).click()
	await expect(tour.getByText('Step 4 of 5', { exact: true })).toBeVisible()
	await expect(tour.getByText('3 + 3 = 6')).toBeVisible()
	await expect(tour.getByText('i = 0')).toBeVisible()
	await expect(tour.getByText('j = 0')).toBeVisible()

	await tour.getByRole('button', { name: /Improve/ }).click()
	await expect(tour.getByRole('link', { name: /Fix it in Practice/ })).toHaveAttribute(
		'href',
		'/practice/two-sum'
	)

	await tour.getByRole('button', { name: 'Reset' }).click()
	await expect(tour.getByRole('button', { name: /Write/ })).toHaveAttribute('aria-pressed', 'true')
})

test('AC11: the guided tour works from the keyboard without moving focus', async ({ page }) => {
	await page.goto('/')
	const tour = page.getByRole('region', { name: 'See the state change' })
	const run = tour.getByRole('button', { name: 'Run', exact: true }).last()
	await run.focus()
	await page.keyboard.press('Enter')
	await expect(tour.getByRole('button', { name: /Run/ }).first()).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	await expect(tour.getByRole('button', { name: /Next/ }).last()).toBeFocused()
})

test('AC2: "Solve Two Sum" opens the Two Sum practice page', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('link', { name: 'Solve Two Sum' }).click()
	await expect(page).toHaveURL(/\/practice\/two-sum$/)
})

test('AC3: "See all problems" reaches the problem table', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('link', { name: 'See all problems' }).click()
	await expect(page).toHaveURL(/#problems$/)
	await expect(page.getByRole('heading', { level: 2, name: 'Problems' })).toBeInViewport()
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
	// Locked, but still listed and linked (through Sign In).
	await expect(table.getByRole('link', { name: 'Contains Duplicate' })).toBeVisible()
	await expect(page.getByText(/Sign in to track your progress/)).toBeVisible()
})

test('AC9/AC13: desktop, tablet and mobile layouts have no document overflow', async ({ page }) => {
	for (const viewport of [
		{ width: 1440, height: 1000 },
		{ width: 1280, height: 900 },
		{ width: 768, height: 1024 },
		{ width: 390, height: 844 }
	]) {
		await page.setViewportSize(viewport)
		await page.goto('/')
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
		expect(overflow).toBe(0)
		await expect(page.getByRole('region', { name: 'See the state change' })).toBeVisible()
	}
})

test('AC12: reduced motion keeps the tour operable without spatial animation', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto('/')
	const tour = page.getByRole('region', { name: 'See the state change' })
	const animationDuration = await tour.evaluate((element) => {
		const duration = getComputedStyle(element).animationDuration
		return duration.endsWith('ms')
			? Number.parseFloat(duration)
			: Number.parseFloat(duration) * 1000
	})
	expect(animationDuration).toBeLessThanOrEqual(0.01)
	await tour.getByRole('button', { name: 'Run', exact: true }).last().click()
	await expect(tour.getByText('[0, 0]', { exact: true })).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
	test('AC15: reference hero palette in ' + colorScheme + ' mode', async ({ page }) => {
		await page.emulateMedia({ colorScheme })
		await page.goto('/')
		const sectionFor = (heading: string) =>
			page.getByRole('heading', { name: heading }).locator('xpath=ancestor::section[1]')
		const heroShell = sectionFor('Practice Python. When it fails, watch it run.').locator('..')
		const header = page.locator('header')
		const headerRail = header.locator('..')
		const tour = page.getByRole('region', { name: 'See the state change' })
		const activeStage = tour.getByRole('button', { name: /Write/ })
		const codePanel = tour
			.getByLabel('Python source from the committed Two Sum trace')
			.locator('..')
		const tourControls = tour.getByRole('button', { name: 'Reset' }).locator('..')

		await expect(headerRail).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
		await expect(header).toHaveCSS(
			'background-color',
			'color(srgb 0.0862745 0.109804 0.0980392 / 0.88)'
		)
		await expect(tour).toHaveCSS('background-color', 'rgb(22, 28, 25)')
		await expect(activeStage).toHaveCSS('background-color', 'rgb(238, 242, 239)')
		await expect(codePanel).toHaveCSS('background-color', 'rgb(238, 242, 239)')
		await expect(tourControls).toHaveCSS('background-color', 'rgb(26, 33, 29)')
		await expect(heroShell).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
		await expect(page.getByRole('link', { name: 'Solve Two Sum' })).toHaveCSS(
			'background-color',
			'rgb(57, 166, 126)'
		)
		await expect(page.locator('main').locator('..')).toHaveCSS(
			'background-color',
			'rgb(15, 20, 18)'
		)
		await expect(sectionFor('A result shows the failure. A trace reveals the cause.')).toHaveCSS(
			'background-color',
			'rgb(244, 245, 242)'
		)
		await expect(sectionFor('From first attempt to a better mental model.')).toHaveCSS(
			'background-color',
			'rgb(15, 20, 18)'
		)
		await expect(page.locator('#problems')).toHaveCSS('background-color', 'rgb(244, 245, 242)')
		await expect(sectionFor('Your code is already telling a story. Learn to read it.')).toHaveCSS(
			'background-color',
			'rgb(15, 20, 18)'
		)
		await expect(page.getByRole('table').locator('..')).toHaveCSS(
			'background-color',
			'rgb(255, 255, 255)'
		)
	})
}
