import { test, expect, type Locator, type Page } from '@playwright/test'

// The four later curated problems in the real app: routes resolve, both the
// straightforward and the optimized solution pass on real Pyodide, Move Zeroes is
// judged in place, and the post-solve optimization challenge appears, reveals
// hints one at a time, and survives later failing attempts. Boots `pnpm dev` —
// run WITHOUT E2E_BASE_URL.

async function setEditor(editor: Locator, text: string) {
	await editor.evaluate((el, value) => {
		const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
		if (setter != null) setter.call(el, value)
		el.dispatchEvent(new Event('input', { bubbles: true }))
	}, text)
}

// Under load the first edit can land before React has hydrated the textarea,
// and is then lost; React tags a DOM node with `__reactProps$…` once it owns it.
async function hydrated(page: Page) {
	await page.waitForFunction(() => {
		const el = document.querySelector('textarea')
		return el != null && Object.keys(el).some((key) => key.startsWith('__reactProps'))
	})
}

async function runCode(page: Page, source: string, expectedLine: string | RegExp) {
	await hydrated(page)
	await setEditor(page.getByLabel('Python code editor'), source)
	await page.getByRole('button', { name: 'Run code' }).click()
	await expect(page.getByText(expectedLine).first()).toBeVisible({ timeout: 120_000 })
}

const ROUTES = [
	['valid-anagram', 'Valid Anagram'],
	['move-zeroes', 'Move Zeroes'],
	['binary-search', 'Binary Search'],
	['valid-parentheses', 'Valid Parentheses']
] as const

for (const [slug, title] of ROUTES) {
	test(`/practice/${slug} resolves and lists all six problems in the picker`, async ({ page }) => {
		await page.goto(`/practice/${slug}`)
		await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
		await expect(page.locator('select option')).toHaveCount(6)
	})
}

test('unknown practice slug is a 404', async ({ page }) => {
	const response = await page.goto('/practice/not-a-problem')
	expect(response?.status()).toBe(404)
})

const ANAGRAM_SORT = `def is_anagram(s, t):
    return sorted(s) == sorted(t)`

test('Valid Anagram: a passing solution unlocks the optional challenge, hints reveal one at a time', async ({
	page
}) => {
	test.setTimeout(180_000)
	await page.goto('/practice/valid-anagram')
	await expect(page.getByTestId('optimization-challenge')).toHaveCount(0)
	await runCode(page, ANAGRAM_SORT, '18 / 18 passed')

	const challenge = page.getByTestId('optimization-challenge')
	await expect(challenge).toBeVisible()
	await expect(challenge).toContainText('As an optional exercise')
	// No verdict on the learner's solution, and no hint until asked for.
	await expect(challenge).not.toContainText('O(')
	await expect(challenge.getByText('observation')).toHaveCount(0)

	await challenge.getByRole('button', { name: 'Show what happened' }).click()
	await expect(challenge.getByText('observation')).toBeVisible()
	await expect(challenge.getByText('reasoning')).toHaveCount(0)
	await challenge.getByRole('button', { name: 'Show what to investigate' }).click()
	await expect(challenge.getByText('reasoning')).toBeVisible()
	await challenge.getByRole('button', { name: 'Show a strategy' }).click()
	await expect(challenge.getByText('strategy', { exact: true })).toBeVisible()
	await expect(challenge.getByRole('button', { name: /Show/ })).toHaveCount(0)
})

const MZ_RETURNS_NEW = `def move_zeroes(nums):
    kept = [x for x in nums if x != 0]
    return kept + [0] * (len(nums) - len(kept))`
const MZ_EXTRA_WRITEBACK = `def move_zeroes(nums):
    kept = [x for x in nums if x != 0]
    nums[:] = kept + [0] * (len(nums) - len(kept))`
const MZ_TWO_POINTERS = `def move_zeroes(nums):
    write = 0
    for read in range(len(nums)):
        if nums[read] != 0:
            nums[write], nums[read] = nums[read], nums[write]
            write += 1`

test('Move Zeroes: returning a new list fails; in-place passes; the solve survives optimization attempts', async ({
	page
}) => {
	test.setTimeout(240_000)
	await page.goto('/practice/move-zeroes')

	// Noncompliant baseline: a different list returned instead of changing nums.
	await runCode(page, MZ_RETURNS_NEW, '0 / 19 passed')
	await expect(
		page.getByText(/Returned a different object instead of changing nums/).first()
	).toBeVisible()
	await expect(page.getByTestId('optimization-challenge')).toHaveCount(0)

	// Extra-array baseline, written back in place, is accepted.
	await runCode(page, MZ_EXTRA_WRITEBACK, '19 / 19 passed')
	const challenge = page.getByTestId('optimization-challenge')
	await expect(challenge).toBeVisible()

	// Try the optimization, but break it: the problem stays solved.
	await runCode(page, MZ_TWO_POINTERS.replace('write += 1', 'write += 2'), /passed/)
	await expect(challenge).toBeVisible()
	await expect(challenge).toContainText('never unsolves')

	// The original solution can be restored.
	await challenge.getByRole('button', { name: 'Restore my solved code' }).click()
	await expect(page.getByLabel('Python code editor')).toHaveValue(MZ_EXTRA_WRITEBACK)

	// The in-place solution also passes.
	await runCode(page, MZ_TWO_POINTERS, '19 / 19 passed')
	await expect(page.getByText('Your attempts', { exact: true })).toBeVisible()
})

const BS_LINEAR = `def search(nums, target):
    for i in range(len(nums)):
        if nums[i] == target:
            return i
    return -1`
const BS_BINARY = `def search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`

test('Binary Search: linear and binary both pass; replay shows left/mid/right', async ({
	page
}) => {
	test.setTimeout(240_000)
	await page.goto('/practice/binary-search')
	await runCode(page, BS_LINEAR, '25 / 25 passed')
	await expect(page.getByTestId('optimization-challenge')).toBeVisible()
	await runCode(page, BS_BINARY, '25 / 25 passed')

	await page.getByRole('button', { name: 'Replay' }).first().click()
	await expect(page.getByText('mid').first()).toBeVisible({ timeout: 60_000 })
})

const VP_STACK = `def is_valid(s):
    closer_for = {'(': ')', '[': ']', '{': '}'}
    stack = []
    for ch in s:
        if ch in closer_for:
            stack.append(closer_for[ch])
        elif not stack or stack.pop() != ch:
            return False
    return not stack`
const VP_COUNT_ONLY = `def is_valid(s):
    return s.count('(') == s.count(')')`

test('Valid Parentheses: a counting shortcut fails; the stack passes and unlocks the challenge', async ({
	page
}) => {
	test.setTimeout(180_000)
	await page.goto('/practice/valid-parentheses')
	await runCode(page, VP_COUNT_ONLY, /\d+ \/ 26 passed/)
	await expect(page.getByText('0 / 26 passed')).toHaveCount(0)
	await expect(page.getByTestId('optimization-challenge')).toHaveCount(0)
	await runCode(page, VP_STACK, '26 / 26 passed')
	await expect(page.getByTestId('optimization-challenge')).toBeVisible()
})
