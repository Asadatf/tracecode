import { test, expect, type Page } from '@playwright/test'

// practice-workspace-layout AC16–AC24: the AI Tutor preview panel. Boots against a
// running dev server (E2E_BASE_URL) as a guest on Two Sum.

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

async function setEditor(page: Page, value: string) {
	await page.getByLabel('Python code editor').evaluate((el, text) => {
		const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
		setter?.call(el, text)
		el.dispatchEvent(new Event('input', { bubbles: true }))
	}, value)
}

const BUGGY = `def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []`

async function open(page: Page, width = 1440, height = 860) {
	await page.setViewportSize({ width, height })
	await page.goto('/practice/two-sum')
	await hydrated(page)
}

const toggle = (page: Page) => page.getByRole('button', { name: 'AI Tutor', exact: true })
const tutor = (page: Page) => page.locator('#pane-tutor')
// Pane widths animate for 150ms, so measure once they have settled.
const tutorWidth = (page: Page) => async () => Math.round((await tutor(page).boundingBox())!.width)

test('AC16: the Tutor is closed by default and opens into a third full-height column', async ({
	page
}) => {
	await open(page)
	await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
	await expect(tutor(page)).toBeHidden()

	await toggle(page).click()
	await expect(tutor(page)).toBeVisible()
	await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')

	const left = (await page.locator('#pane-left').boundingBox())!
	const code = (await page.locator('#pane-code').boundingBox())!
	const results = (await page.locator('#pane-results').boundingBox())!
	const box = (await tutor(page).boundingBox())!
	// Three columns left to right, the Tutor spanning code and results together.
	expect(left.x + left.width).toBeLessThanOrEqual(code.x)
	expect(code.x + code.width).toBeLessThanOrEqual(box.x + 1)
	expect(box.y).toBeLessThanOrEqual(code.y + 1)
	expect(box.y + box.height).toBeGreaterThanOrEqual(results.y + results.height - 1)
	// Code and results stay stacked in the middle column.
	expect(Math.abs(code.x - results.x)).toBeLessThanOrEqual(1)
})

test('AC18: opening and closing never loses the editor, the run results or the replay step', async ({
	page
}) => {
	test.setTimeout(120_000)
	await open(page)
	await setEditor(page, BUGGY)
	await page.getByRole('button', { name: 'Run code' }).click()
	await expect(page.getByText('1 / 3 passed').filter({ visible: true }).first()).toBeVisible({
		timeout: 90_000
	})
	await page.getByRole('button', { name: 'Replay', exact: true }).nth(1).click()
	await expect(page.getByText(/Step 1 of \d+/)).toBeVisible()
	await page.getByRole('button', { name: /Next step/ }).click()
	await page.getByRole('button', { name: /Next step/ }).click()
	await expect(page.getByText(/Step 3 of \d+/)).toBeVisible()

	await toggle(page).click()
	await expect(tutor(page)).toBeVisible()
	await toggle(page).click()
	await expect(tutor(page)).toBeHidden()

	await expect(page.getByLabel('Python code editor')).toHaveValue(BUGGY)
	await expect(page.getByText(/Step 3 of \d+/)).toBeVisible()
	await page.getByRole('tab', { name: 'Test results' }).click()
	await expect(page.getByText('1 / 3 passed').filter({ visible: true }).first()).toBeVisible()
})

test('AC17: the three column widths resize by keyboard and stop at their minimums', async ({
	page
}) => {
	await open(page)
	await toggle(page).click()
	const splitter = page.locator('#tutor-splitter')
	await expect(splitter).toHaveAttribute('role', 'separator')
	const before = (await tutor(page).boundingBox())!.width

	await splitter.focus()
	await page.keyboard.press('ArrowLeft')
	await page.keyboard.press('Shift+ArrowLeft')
	await expect.poll(tutorWidth(page)).toBeGreaterThan(before)

	await page.keyboard.press('Home')
	await expect.poll(tutorWidth(page)).toBeGreaterThanOrEqual(299)
	await page.keyboard.press('End')
	await expect
		.poll(async () => Math.round((await page.locator('#pane-code').boundingBox())!.width))
		.toBeGreaterThanOrEqual(419)

	// The challenge pane cannot take the middle below its minimum either.
	await page.locator('#tour-split-v').focus()
	await page.keyboard.press('End')
	await expect
		.poll(async () => Math.round((await page.locator('#pane-code').boundingBox())!.width))
		.toBeGreaterThanOrEqual(419)
	expect((await page.locator('#pane-left').boundingBox())!.width).toBeGreaterThanOrEqual(279)
})

test('AC17: dragging the splitter resizes the Tutor', async ({ page }) => {
	await open(page)
	await toggle(page).click()
	await page.waitForTimeout(400) // let the 150ms open transition finish
	const handle = (await page.locator('#tutor-splitter').boundingBox())!
	const before = await tutorWidth(page)()
	await page.mouse.move(handle.x + handle.width / 2, handle.y + 200)
	await page.mouse.down()
	await page.mouse.move(handle.x - 90, handle.y + 200, { steps: 6 })
	await page.mouse.up()
	await expect.poll(tutorWidth(page)).toBeGreaterThan(before + 60)
})

test('AC19: maximize fills the workspace, restore and Escape bring it back', async ({ page }) => {
	await open(page)
	await toggle(page).click()
	await page.waitForTimeout(400) // let the 150ms open transition finish
	const normal = await tutorWidth(page)()
	await page.getByRole('button', { name: 'Maximize AI Tutor' }).click()
	await expect.poll(tutorWidth(page)).toBeGreaterThan(normal * 2)
	await page.getByRole('button', { name: 'Restore AI Tutor size' }).click()
	await expect.poll(async () => Math.abs((await tutorWidth(page)()) - normal)).toBeLessThan(2)

	await page.getByRole('button', { name: 'Maximize AI Tutor' }).click()
	await page.keyboard.press('Escape')
	await expect(tutor(page)).toBeVisible()
	await expect.poll(async () => Math.abs((await tutorWidth(page)()) - normal)).toBeLessThan(2)
})

test('AC20: Escape and the close button close it and return focus to the toolbar button', async ({
	page
}) => {
	await open(page)
	await toggle(page).click()
	await expect(page.getByRole('heading', { name: 'AI Tutor' })).toBeFocused()
	await page.keyboard.press('Escape')
	await expect(tutor(page)).toBeHidden()
	await expect(toggle(page)).toBeFocused()

	await toggle(page).click()
	await page.getByRole('button', { name: 'Close AI Tutor' }).click()
	await expect(tutor(page)).toBeHidden()
	await expect(toggle(page)).toBeFocused()
})

test('AC21: it says plainly that tutoring is not connected and shows no AI replies', async ({
	page
}) => {
	const outgoing: string[] = []
	page.on('request', (request) => outgoing.push(request.url()))
	await open(page)
	await toggle(page).click()
	await expect(page.getByText('Not connected')).toBeVisible()
	await expect(page.getByText('AI tutoring isn’t connected yet.')).toBeVisible()
	await expect(page.getByText('No conversation yet')).toBeVisible()
	await expect(page.getByLabel('Message to the AI Tutor')).toBeDisabled()
	await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled()
	for (const name of ['Ask a question', 'Get a hint', 'Explain my failure']) {
		await expect(page.getByRole('button', { name })).toBeDisabled()
	}
	await expect(page.getByText('Two Sum').last()).toBeVisible()
	// Nothing was sent to a model or any AI endpoint.
	expect(
		outgoing.filter((url) => /openrouter|openai|anthropic|\/api\/.*(tutor|ai)/i.test(url))
	).toEqual([])
})

test('AC22: on a mid-width screen it is a drawer that traps focus and leaves the editor alone', async ({
	page
}) => {
	await open(page, 900, 800)
	const codeBefore = (await page.locator('#pane-code').boundingBox())!
	await toggle(page).click()
	await expect(page.getByRole('dialog', { name: 'AI Tutor' })).toBeVisible()
	// The editor column is not squeezed: it keeps exactly the width it had.
	const codeAfter = (await page.locator('#pane-code').boundingBox())!
	expect(Math.abs(codeAfter.width - codeBefore.width)).toBeLessThan(2)
	// Tab never leaves the drawer.
	for (let i = 0; i < 8; i++) await page.keyboard.press('Tab')
	expect(await page.evaluate(() => document.activeElement?.closest('#pane-tutor') != null)).toBe(
		true
	)
	await page.keyboard.press('Escape')
	await expect(tutor(page)).toBeHidden()
})

test('AC23: on a phone it opens full screen', async ({ page }) => {
	await open(page, 390, 844)
	await toggle(page).click()
	const box = (await tutor(page).boundingBox())!
	expect(box.width).toBeGreaterThanOrEqual(388)
	expect(box.height).toBeGreaterThanOrEqual(840)
	await expect(page.getByRole('button', { name: 'Maximize AI Tutor' })).toHaveCount(0)
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	await page.getByRole('button', { name: 'Close AI Tutor' }).click()
	await expect(tutor(page)).toBeHidden()
})

test('AC24: panes scroll independently', async ({ page }) => {
	await open(page)
	await toggle(page).click()
	for (const selector of ['#pane-left', '#pane-code', '#pane-results', '#pane-tutor']) {
		await expect(page.locator(selector)).toBeVisible()
	}
	const styles = await page.evaluate(() =>
		['#pane-left > div:last-child', '[role="log"]'].map((selector) => {
			const el = document.querySelector(selector)
			return el == null ? null : getComputedStyle(el).overflowY
		})
	)
	expect(styles).toEqual(['auto', 'auto'])
})
