import { test, expect, type Locator, type Page } from '@playwright/test'

// specs/features/practice-run-progress.md in the real workspace: Run opens the Tests tab and
// each test's result appears as the worker reports it. Guest-accessible (Two Sum). The solution
// does some genuine busy work per test so results are spread over time; nothing is simulated.

async function setEditor(editor: Locator, text: string) {
	await editor.evaluate((el, value) => {
		const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
		if (setter != null) setter.call(el, value)
		el.dispatchEvent(new Event('input', { bubbles: true }))
	}, text)
}

const SOLUTION = (body: string) => `def two_sum(nums, target):
    x = 0
    for _ in range(1500000):
        x += 1
${body}
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []`

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('tc-practice-tour-v1', '1')
		} catch {
			// storage unavailable: the tour just shows
		}
	})
})

const progress = (page: Page) => page.getByText(/Running tests · \d+ \/ 6 done/)

test('Run opens Tests and shows results one by one, with failure details', async ({ page }) => {
	test.setTimeout(120_000)
	await page.goto('/practice/two-sum')
	await expect(page.getByRole('heading', { level: 1, name: 'Two Sum' })).toBeVisible()
	await setEditor(
		page.getByLabel('Python code editor'),
		SOLUTION('    if target == 6 and nums == [3, 2, 4]:\n        return [0, 0]')
	)

	// Start from the Replay tab: Run must bring Tests forward.
	await page.getByRole('tab', { name: /Replay/ }).click()
	const counts = new Set<string>()
	await page.getByRole('button', { name: 'Run code' }).click()
	await expect(page.getByRole('tab', { name: /Test results/ })).toHaveAttribute(
		'aria-selected',
		'true'
	)

	// Sample the live heading until the run ends: several different counts must be seen.
	await expect
		.poll(
			async () => {
				const heading = await progress(page)
					.first()
					.textContent({ timeout: 200 })
					.catch(() => null)
				if (heading != null) counts.add(heading.replace(/ · \d+ failed/, ''))
				return (await page.getByText('4 / 6 passed').filter({ visible: true }).count()) > 0
			},
			{ timeout: 60_000, intervals: [40] }
		)
		.toBe(true)
	const intermediate = [...counts].filter((c) => !/ 0 \/ 6| 6 \/ 6/.test(c))
	expect(intermediate.length).toBeGreaterThanOrEqual(2)

	// Final view: the failure keeps its details, and Tests is still the active tab.
	await expect(page.getByText('Returned: [0, 0]').first()).toBeVisible()
	await expect(page.getByRole('tab', { name: /Test results/ })).toHaveAttribute(
		'aria-selected',
		'true'
	)
})

test('a tab the learner picks during a run is kept', async ({ page }) => {
	test.setTimeout(120_000)
	await page.goto('/practice/two-sum')
	await setEditor(page.getByLabel('Python code editor'), SOLUTION(''))
	await page.getByRole('button', { name: 'Run code' }).click()
	await expect(progress(page).first()).toBeVisible()
	await page.getByRole('tab', { name: /Replay/ }).click()
	await expect(page.getByText('6 / 6 passed').filter({ visible: true }).first()).toBeVisible({
		timeout: 60_000
	})
	await expect(page.getByRole('tab', { name: /Replay/ })).toHaveAttribute('aria-selected', 'true')
})

test('a timeout keeps the tests that finished and the next run starts clean', async ({ page }) => {
	test.setTimeout(150_000)
	await page.goto('/practice/two-sum')
	await setEditor(
		page.getByLabel('Python code editor'),
		SOLUTION('    if nums == [3, 3]:\n        while True:\n            pass')
	)
	await page.getByRole('button', { name: 'Run code' }).click()
	// The existing notice and the results message both say it, so match either.
	await expect(page.getByText(/Execution timed out/).first()).toBeVisible({ timeout: 60_000 })
	await expect(page.getByText('2 of 6 tests finished before the run stopped.')).toBeVisible()

	await setEditor(page.getByLabel('Python code editor'), SOLUTION(''))
	await page.getByRole('button', { name: 'Run code' }).click()
	await expect(page.getByText('6 / 6 passed').filter({ visible: true }).first()).toBeVisible({
		timeout: 90_000
	})
	await expect(page.getByText(/Execution timed out/)).toHaveCount(0)
})

test('Run does not raise the navigation curtain', async ({ page }) => {
	test.setTimeout(90_000)
	await page.goto('/practice/two-sum')
	await setEditor(page.getByLabel('Python code editor'), SOLUTION(''))
	await page.getByRole('button', { name: 'Run code' }).click()
	await expect(page.getByText('6 / 6 passed').filter({ visible: true }).first()).toBeVisible({
		timeout: 60_000
	})
	await expect(page.locator('[data-active="true"]')).toHaveCount(0)
})
