import { test, expect, type Locator } from '@playwright/test'

// Set a controlled React textarea reliably — fill() does not clear it. Uses the
// native value setter + a bubbling input event so React's onChange fires with
// the full replacement text.
async function setEditor(editor: Locator, text: string) {
	await editor.evaluate((el, value) => {
		const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
		if (setter != null) setter.call(el, value)
		el.dispatchEvent(new Event('input', { bubbles: true }))
	}, text)
}

// M3 acceptance: drive the real Next.js route end to end in Chromium — open Two
// Sum, run the buggy solution, see 1 pass / 2 fail, replay a failure, see the
// self-pairing bug, fix it, and get all tests passing. This boots `pnpm dev`
// (Playwright webServer), so run it WITHOUT E2E_BASE_URL.

const BUGGY = `def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []`

const FIXED = `def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []`

test('a learner runs the buggy Two Sum, replays the failure, fixes it, and passes', async ({
	page
}) => {
	test.setTimeout(180_000)

	await page.goto('/practice/two-sum')
	await expect(page.getByRole('heading', { level: 1, name: 'Two Sum' })).toBeVisible()

	const editor = page.getByLabel('Python code editor')
	await setEditor(editor, BUGGY)
	await page.getByRole('button', { name: 'Run code' }).click()

	// One passing, two failing — the self-pairing bug returns [0, 0].
	await expect(page.getByText('1 / 3 passed').first()).toBeVisible({ timeout: 120_000 })
	await expect(page.getByText('Returned: [0, 0]').first()).toBeVisible()

	// Replay a failing test (t2 is the second result row).
	await page.getByRole('button', { name: 'Replay', exact: true }).nth(1).click()
	await expect(page.getByText('Watch your code, one step at a time')).toBeVisible()

	// Open the step list: the bug is visible — both pointers on index 0, returns [0, 0].
	await page.getByRole('button', { name: /All steps/ }).click()
	await expect(page.getByText('Both i and j reference index 0')).toBeVisible()
	await expect(page.getByText('The function returned [0, 0].')).toBeVisible()

	// Fix the inner loop and rerun — all official tests pass.
	await setEditor(editor, FIXED)
	await page.getByRole('button', { name: 'Run code' }).click()
	await expect(page.getByText('3 / 3 passed').first()).toBeVisible({ timeout: 120_000 })
})
