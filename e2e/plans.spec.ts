import { test, expect } from '@playwright/test'
import { STUDY_PLANS } from '../src/lib/plans/plans'
import { PROBLEMS } from '../src/lib/trace/problems'
import { openAsLearner } from './helpers/auth'

// specs/features/study-plans.md. Boots `pnpm dev` — run WITHOUT E2E_BASE_URL.

test('AC1: a signed-out visitor is sent to sign in and back to /plans', async ({ page }) => {
	await page.goto('/plans')
	await page.waitForURL((url) => url.pathname === '/login')
	expect(new URL(page.url()).searchParams.get('next')).toBe('/plans')
})

test('AC2, AC3, AC5: plans list with progress, a plan page in order, and the nav item', async ({
	page
}) => {
	await openAsLearner(page, '/plans')
	await expect(page.getByRole('heading', { level: 1, name: 'Study plans' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Study plans' }).first()).toHaveAttribute(
		'aria-current',
		'page'
	)
	for (const title of [
		'Arrays and hashing',
		'Two pointers',
		'Searching and stacks',
		'Step by step'
	]) {
		await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
	}

	await page.getByRole('link', { name: 'Two pointers' }).click()
	await page.waitForURL((url) => url.pathname === '/plans/two-pointers')
	// Row 0 is the header; the rest follow the plan's order (AC3).
	const plan = STUDY_PLANS.find((p) => p.slug === 'two-pointers')!
	const rows = page.getByRole('row')
	await expect(rows).toHaveCount(plan.problems.length + 1)
	for (const [i, slug] of plan.problems.entries()) {
		await expect(rows.nth(i + 1)).toContainText(PROBLEMS[slug]!.title)
	}
})

test('edge: an unknown plan is a 404', async ({ page }) => {
	const response = await page.goto('/plans/not-a-plan')
	expect(response?.status()).toBe(404)
})
