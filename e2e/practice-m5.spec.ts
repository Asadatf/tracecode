import { test, expect, type Locator } from '@playwright/test'

// M5 in the real app: the second problem (Contains Duplicate) runs through the
// generic engine and earns optimization guidance, and custom input runs through
// Pyodide without touching the official score. Boots `pnpm dev` — run WITHOUT
// E2E_BASE_URL.

async function setEditor(editor: Locator, text: string) {
	await editor.evaluate((el, value) => {
		const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
		if (setter != null) setter.call(el, value)
		el.dispatchEvent(new Event('input', { bubbles: true }))
	}, text)
}

const CD_NESTED = `def contains_duplicate(nums):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] == nums[j]:
                return True
    return False`

test('Contains Duplicate runs on the generic engine and earns optimization guidance', async ({
	page
}) => {
	test.setTimeout(180_000)
	await page.goto('/practice/contains-duplicate')
	await expect(page.getByRole('heading', { level: 1, name: 'Contains Duplicate' })).toBeVisible()

	await setEditor(page.getByLabel('Python code editor'), CD_NESTED)
	await page.getByRole('button', { name: 'Run code' }).click()

	await expect(page.getByText('5 / 5 passed').first()).toBeVisible({ timeout: 120_000 })
	// A correct nested-loop solution: optimization guidance becomes available.
	await expect(page.getByText('A faster approach is possible')).toBeVisible()
})

test('custom input runs through Pyodide and stays out of official scoring', async ({ page }) => {
	test.setTimeout(180_000)
	await page.goto('/practice/two-sum')
	await expect(page.getByRole('heading', { level: 1, name: 'Two Sum' })).toBeVisible()

	// Run custom input (defaults to the first example) without running official tests.
	await page.getByRole('button', { name: 'Run custom input' }).click()
	await expect(page.getByText('exploration (not scored)')).toBeVisible({ timeout: 120_000 })

	// Official scoring was never touched.
	await expect(page.getByText('passed', { exact: false })).toHaveCount(0)
})
