import { test, expect } from '@playwright/test'
import { openAsLearner } from './helpers/auth'
import { PROBLEMS } from '../src/lib/trace/problems'
import { TWO_SUM_BUGGY, TWO_SUM_PASSING, hydrated, setEditor, skipTour } from './helpers/practice'

// Two Sum's test count, from the catalog, so these never go stale when tests are added.
const TOTAL = PROBLEMS['two-sum']!.tests.length
const ALL_PASSED = `${TOTAL} / ${TOTAL} passed`
const SOME_FAILED = new RegExp(`^[0-${TOTAL - 1}] / ${TOTAL} passed$`)

// The student-feature additions to the practice workspace, on Two Sum (open to
// guests). Boots `pnpm dev` — run WITHOUT E2E_BASE_URL.

test.beforeEach(async ({ page }) => {
	await skipTour(page)
})

test('editor-drafts AC1–AC3: an edit survives a reload, and Reset goes back to the starter', async ({
	page
}) => {
	await page.goto('/practice/two-sum')
	await hydrated(page)
	const editor = page.getByLabel('Python code editor')
	await setEditor(editor, '# my work in progress\n' + TWO_SUM_PASSING)
	// The draft is saved half a second after typing stops.
	await page.waitForFunction(() =>
		(localStorage.getItem('tracecode:draft:v1:two-sum') ?? '').includes('my work in progress')
	)

	await page.reload()
	await hydrated(page)
	await expect(editor).toHaveValue(/# my work in progress/)
	await expect(page.getByText('Restored your last edit')).toBeVisible()

	await page.getByRole('button', { name: 'Reset code' }).click()
	await expect(editor).not.toHaveValue(/my work in progress/)
	await expect(editor).toHaveValue(/def two_sum\(nums: list\[int\], target: int\)/)
	await page.reload()
	await hydrated(page)
	await expect(editor).not.toHaveValue(/my work in progress/)
})

test('workspace-shortcuts AC1: Ctrl+Enter in the editor runs the tests', async ({ page }) => {
	test.setTimeout(180_000)
	await page.goto('/practice/two-sum')
	await hydrated(page)
	const editor = page.getByLabel('Python code editor')
	await setEditor(editor, TWO_SUM_PASSING)
	await editor.focus()
	await editor.press('Control+Enter')
	await expect(page.getByText(ALL_PASSED).filter({ visible: true }).first()).toBeVisible({
		timeout: 120_000
	})
	// The shortcut did not type a new line into the code (AC6's counterpart).
	await expect(editor).toHaveValue(TWO_SUM_PASSING)
})

test('workspace-shortcuts AC4: ? outside the editor lists the shortcuts; Escape closes it', async ({
	page
}) => {
	await page.goto('/practice/two-sum')
	await hydrated(page)
	await page.getByRole('heading', { level: 1, name: 'Two Sum' }).click()
	await page.keyboard.press('Shift+Slash')
	const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
	await expect(dialog).toBeVisible()
	await expect(dialog.getByText('Run code')).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(dialog).toBeHidden()
})

test('solutions-tab AC2, AC4–AC7: locked until a pass, then explained, replayable and compared', async ({
	page
}) => {
	test.setTimeout(240_000)
	await page.goto('/practice/two-sum')
	await hydrated(page)
	const challengeTabs = page.getByRole('tablist', { name: 'Challenge tabs' })

	await challengeTabs.getByRole('tab', { name: 'Solutions' }).click()
	await expect(page.getByText(/Solutions unlock when you pass all the tests/)).toBeVisible()

	await setEditor(page.getByLabel('Python code editor'), TWO_SUM_PASSING)
	await page.getByRole('button', { name: 'Run code' }).click()
	await expect(page.getByText(ALL_PASSED).filter({ visible: true }).first()).toBeVisible({
		timeout: 120_000
	})

	await challengeTabs.getByRole('tab', { name: 'Solutions' }).click()
	await expect(page.getByRole('heading', { name: 'Check every pair' })).toBeVisible()
	const optimised = page.getByRole('heading', { name: "Remember what you've seen" })
	await expect(optimised).toBeVisible()

	await page.getByRole('button', { name: 'Watch it run' }).nth(1).click()
	await expect(
		page.getByText(/Remember what you've seen · two_sum\(\[2,7,11,15\], 9\)/).first()
	).toBeVisible({ timeout: 60_000 })

	await page.getByRole('button', { name: 'Compare', exact: true }).click()
	await expect(page.getByText(/as much work as the optimised approach/)).toBeVisible({
		timeout: 60_000
	})
})

test('compare-attempts AC2–AC4: a fail then a pass shows the line that fixed it', async ({
	page
}) => {
	test.setTimeout(240_000)
	await page.goto('/practice/two-sum')
	await hydrated(page)
	const editor = page.getByLabel('Python code editor')
	const run = page.getByRole('button', { name: 'Run code' })

	await setEditor(editor, TWO_SUM_BUGGY)
	await run.click()
	await expect(page.getByText(SOME_FAILED).filter({ visible: true }).first()).toBeVisible({
		timeout: 120_000
	})
	await setEditor(editor, TWO_SUM_PASSING)
	await run.click()
	await expect(page.getByText(ALL_PASSED).filter({ visible: true }).first()).toBeVisible({
		timeout: 120_000
	})

	await page
		.getByRole('tablist', { name: 'Challenge tabs' })
		.getByRole('tab', { name: 'History' })
		.click()
	await page.getByText('Compare attempts').click()
	const changes = page.getByRole('group', { name: 'Changes between the two attempts' })
	await expect(changes.getByText('for j in range(len(nums)):')).toBeVisible()
	await expect(changes.getByText('for j in range(i + 1, len(nums)):')).toBeVisible()
})

test('problem-notes AC2: a signed-out visitor is asked to sign in', async ({ page }) => {
	await page.goto('/practice/two-sum')
	await hydrated(page)
	await page
		.getByRole('tablist', { name: 'Challenge tabs' })
		.getByRole('tab', { name: 'Notes' })
		.click()
	await expect(page.getByText(/Sign in to keep notes on problems/)).toBeVisible()
	await expect(page.getByLabel('Your notes on this problem')).toHaveCount(0)
})

test('problem-notes AC3, AC4, AC7: a signed-in note saves, survives a reload, and clears', async ({
	page
}) => {
	await openAsLearner(page, '/practice/climbing-stairs')
	await hydrated(page)
	const notesTab = page
		.getByRole('tablist', { name: 'Challenge tabs' })
		.getByRole('tab', { name: 'Notes' })
	await notesTab.click()
	const box = page.getByLabel('Your notes on this problem')
	await box.fill('ways(n) = ways(n - 1) + ways(n - 2)')
	await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible({
		timeout: 15_000
	})

	await page.reload()
	await hydrated(page)
	await notesTab.click()
	await expect(box).toHaveValue('ways(n) = ways(n - 1) + ways(n - 2)')

	await box.fill('')
	await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible({
		timeout: 15_000
	})
	await page.reload()
	await hydrated(page)
	await notesTab.click()
	await expect(box).toHaveValue('')
})
