import { test, expect, type Page } from '@playwright/test'

// practice-workspace-layout AC6: the code pane folds upward to its header bar.

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('tc-practice-tour-v1', '1')
		} catch {
			// storage unavailable: the tour just shows
		}
	})
})

async function hydrated(page: Page) {
	await page.waitForFunction(() => {
		const el = document.querySelector('textarea')
		return el != null && Object.keys(el).some((key) => key.startsWith('__reactProps'))
	})
}

const height = (page: Page, selector: string) => async () =>
	Math.round((await page.locator(selector).boundingBox())!.height)

test('the code pane folds up to a bar and the results take the room, then it restores', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 860 })
	await page.goto('/practice/two-sum')
	await hydrated(page)
	const editor = page.getByLabel('Python code editor')
	await editor.fill('def two_sum(nums, target):\n    return [0, 1]')

	const codeBefore = await height(page, '#pane-code')()
	const resultsBefore = await height(page, '#pane-results')()

	await page.getByRole('button', { name: 'Collapse code pane' }).click()
	await expect.poll(height(page, '#pane-code')).toBeLessThanOrEqual(46)
	await expect(editor).toBeHidden()
	await expect.poll(height(page, '#pane-results')).toBeGreaterThan(resultsBefore + 100)
	await expect(page.getByRole('button', { name: 'Expand code pane' })).toHaveAttribute(
		'aria-expanded',
		'false'
	)

	// Collapsing the results instead folds the code back open: never both at once.
	await page.getByRole('button', { name: 'Collapse results pane' }).click()
	await expect.poll(height(page, '#pane-results')).toBeLessThanOrEqual(46)
	await expect(editor).toBeVisible()

	await page.getByRole('button', { name: 'Expand results pane' }).click()
	await page.getByRole('button', { name: 'Collapse code pane' }).click()
	await page.getByRole('button', { name: 'Expand code pane' }).click()
	await expect(editor).toBeVisible()
	await expect(editor).toHaveValue('def two_sum(nums, target):\n    return [0, 1]')
	await expect
		.poll(async () => Math.abs((await height(page, '#pane-code')()) - codeBefore))
		.toBeLessThan(3)
})
