import { test, type Page } from '@playwright/test'

// The five restricted problems need a session. Specs that exercise them run only
// when a dedicated test learner is supplied via the environment; they never
// create or touch real accounts, and are skipped (not faked) otherwise.
export const LEARNER_EMAIL = process.env.E2E_LEARNER_EMAIL
export const LEARNER_PASSWORD = process.env.E2E_LEARNER_PASSWORD
export const hasLearner = Boolean(LEARNER_EMAIL && LEARNER_PASSWORD)

export async function openAsLearner(page: Page, path: string) {
	test.skip(!hasLearner, 'Set E2E_LEARNER_EMAIL / E2E_LEARNER_PASSWORD to run signed-in specs')
	await page.goto(`/login?next=${encodeURIComponent(path)}`)
	await page.getByLabel('Email').fill(LEARNER_EMAIL ?? '')
	await page.getByLabel('Password', { exact: true }).fill(LEARNER_PASSWORD ?? '')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await page.waitForURL((url) => url.pathname === path)
}
