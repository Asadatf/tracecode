import { test, expect } from '@playwright/test'

test('AC18: landing cursor tracks its hotspot, restores native semantics and cleans up', async ({
	page
}) => {
	await page.goto('/')
	const cursor = page.locator('[data-landing-cursor]')
	await expect(page.locator('[data-cursor-ready]')).toHaveCount(1)
	await page.mouse.move(20, 160)
	await expect(cursor).toHaveAttribute('data-visible', 'true')
	await expect
		.poll(() =>
			cursor.evaluate((el) => {
				const box = el.getBoundingClientRect()
				return [box.x + 2, box.y + 2]
			})
		)
		.toEqual([20, 160])
	await page.getByRole('heading', { level: 1 }).hover()
	await expect(cursor).not.toHaveAttribute('data-visible')
	await page.getByRole('link', { name: 'Solve Two Sum' }).hover()
	await expect(cursor).toHaveAttribute('data-interactive', 'true')
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await expect(cursor).not.toHaveAttribute('data-visible')
	await expect(page.locator('[data-cursor="active"]')).toHaveCount(0)
	await page.getByRole('link', { name: 'Solve Two Sum' }).click()
	await expect(page).toHaveURL(/\/practice\/two-sum$/)
	await expect(cursor).toHaveCount(0)
})

test('AC16: narrative sequence progresses and remains visible when scrolling back', async ({
	page
}) => {
	await page.goto('/')
	const narrative = page.locator('[data-reveal]').first()
	await expect(narrative).toHaveAttribute('data-state', 'pending')
	await narrative.evaluate((el) => el.scrollIntoView({ behavior: 'instant' }))
	await expect(narrative).toHaveAttribute('data-state', 'in')
	const explanation = narrative.locator('strong').last()
	expect(
		await explanation.evaluate((el) => Number(getComputedStyle(el.parentElement!).opacity))
	).toBeLessThan(0.1)
	await expect
		.poll(() => explanation.evaluate((el) => Number(getComputedStyle(el.parentElement!).opacity)), {
			timeout: 6000
		})
		.toBe(1)
	await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
	await expect(narrative).toHaveAttribute('data-state', 'in')
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await expect(page.locator('[data-state="pending"]')).toHaveCount(0)
})

test('AC17: native anchor navigation preserves browser history', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('navigation').getByRole('link', { name: 'Problems', exact: true }).click()
	await expect(page).toHaveURL(/#problems$/)
	await expect(page.getByRole('heading', { name: 'Problems', exact: true })).toBeInViewport()
	await page.goBack()
	await expect(page).not.toHaveURL(/#problems$/)
	await page.goForward()
	await expect(page).toHaveURL(/#problems$/)
})

test('AC18: touch devices use native cursor', async ({ browser }) => {
	const context = await browser.newContext({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 }
	})
	const page = await context.newPage()
	await page.goto('http://localhost:3000/')
	await expect(page.locator('[data-landing-cursor]')).toHaveCSS('display', 'none')
	await expect(page.locator('[data-cursor="active"]')).toHaveCount(0)
	await context.close()
})
