import { test, expect } from '@playwright/test'
import { TWO_SUM_PASSING, hydrated, setEditor, skipTour } from './helpers/practice'

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
	await expect(page.getByText('3 / 3 passed').filter({ visible: true }).first()).toBeVisible({
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
