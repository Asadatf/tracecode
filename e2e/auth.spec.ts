import { test, expect } from '@playwright/test'

// specs/features/auth-access.md. Nothing here submits real credentials or creates
// an account: the Supabase round trip is covered by the shared authenticateAction
// (unit-tested helpers) and, with E2E_LEARNER_*, by the signed-in specs.

test('AC1: the signed-out landing header offers Sign In and Register, not learner navigation', async ({
	page
}) => {
	await page.goto('/')
	const nav = page.getByRole('navigation', { name: 'Main' })
	await expect(nav.getByRole('link', { name: 'How it works' })).toBeVisible()
	await expect(nav.getByRole('link', { name: 'Problems' })).toBeVisible()
	await expect(nav.getByRole('link', { name: 'Progress' })).toHaveCount(0)
	await expect(page.getByRole('button', { name: /Notifications/ })).toHaveCount(0)
	await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0)
	await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Register', exact: true })).toBeVisible()
})

test('AC1: the server-rendered HTML already has the signed-out header (no client flash)', async ({
	request
}) => {
	const html = await (await request.get('/')).text()
	expect(html).toContain('href="/register"')
	expect(html).not.toContain('href="/dashboard"')
})

test('AC3: Two Sum stays open to a signed-out visitor', async ({ page }) => {
	const response = await page.goto('/practice/two-sum')
	expect(response?.status()).toBe(200)
	await expect(page).toHaveURL('/practice/two-sum')
	await expect(page.getByRole('heading', { level: 1, name: 'Two Sum' })).toBeVisible()
})

test('AC4: unknown routes still 404 rather than redirecting', async ({ page }) => {
	const response = await page.goto('/practice/not-a-problem')
	expect(response?.status()).toBe(404)
})

test('AC5: the catalog locks the other five problems and routes them through Sign In', async ({
	page
}) => {
	await page.goto('/')
	const table = page.getByRole('table')
	await expect(table.getByRole('link', { name: 'Two Sum' })).toHaveAttribute(
		'href',
		'/practice/two-sum'
	)
	await expect(table.getByText('Sign in to unlock')).toHaveCount(5)
	await expect(table.getByRole('link', { name: 'Valid Anagram' })).toHaveAttribute(
		'href',
		'/login?next=%2Fpractice%2Fvalid-anagram'
	)
	await table.getByRole('link', { name: 'Binary Search' }).click()
	await expect(page).toHaveURL('/login?next=%2Fpractice%2Fbinary-search')
})

test('AC6: /login and /register resolve independently with their own fields', async ({ page }) => {
	await page.goto('/login')
	await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
	await expect(page.getByLabel('Confirm password')).toHaveCount(0)
	await expect(page.getByRole('link', { name: /Forgot/i })).toHaveCount(0)
	await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
		'href',
		'/register'
	)

	await page.goto('/register')
	await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible()
	await expect(page.getByLabel('Email')).toBeVisible()
	await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
	await expect(page.getByLabel('Confirm password')).toBeVisible()
	await expect(page.getByText('Use 8–72 characters.')).toBeVisible()
	await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
		'href',
		'/login'
	)
})

test('AC6: the destination survives switching between Sign In and Register', async ({ page }) => {
	await page.goto('/login?next=%2Fpractice%2Fmove-zeroes')
	await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
		'href',
		'/register?next=%2Fpractice%2Fmove-zeroes'
	)
})

test('AC6: show/hide toggles the password field', async ({ page }) => {
	await page.goto('/login')
	const password = page.getByLabel('Password', { exact: true })
	await expect(password).toHaveAttribute('type', 'password')
	await page.getByRole('button', { name: 'Show password' }).click()
	await expect(password).toHaveAttribute('type', 'text')
	await page.getByRole('button', { name: 'Hide password' }).click()
	await expect(password).toHaveAttribute('type', 'password')
})

test('AC7: Register validates length and confirmation without calling the server', async ({
	page
}) => {
	let serverCalls = 0
	page.on('request', (request) => {
		if (request.method() === 'POST') serverCalls += 1
	})
	await page.goto('/register')
	await page.waitForFunction(() => document.querySelector('form') != null)
	await page.getByLabel('Email').fill('nobody@example.com')

	await page.getByLabel('Password', { exact: true }).fill('short')
	await page.getByLabel('Confirm password').fill('short')
	await page.getByRole('button', { name: 'Create account' }).click()
	await expect(page.locator('p[role="alert"]')).toContainText('must be 8–72 characters')

	await page.getByLabel('Password', { exact: true }).fill('long-enough-1')
	await page.getByLabel('Confirm password').fill('different-1')
	await page.getByRole('button', { name: 'Create account' }).click()
	await expect(page.locator('p[role="alert"]')).toContainText('don’t match')
	expect(serverCalls).toBe(0)
})

test('AC9: an unsafe next value is never carried into the form', async ({ page }) => {
	await page.goto('/login?next=https%3A%2F%2Fevil.example')
	await expect(page.locator('input[name="next"]')).toHaveValue('/dashboard')
	await page.goto('/login?next=%2F%2Fevil.example')
	await expect(page.locator('input[name="next"]')).toHaveValue('/dashboard')
})

test('AC11: phone width — form first, no brand panel, no horizontal scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	for (const path of ['/login', '/register']) {
		await page.goto(path)
		await expect(page.getByRole('complementary')).toBeHidden()
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
		expect(overflow).toBe(0)
		const button = await page.locator('button[type="submit"]').boundingBox()
		expect(button?.height ?? 0).toBeGreaterThanOrEqual(44)
	}
})

test('AC11: desktop shows the brand panel; reduced motion freezes it', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.setViewportSize({ width: 1440, height: 900 })
	await page.goto('/login')
	await expect(page.getByRole('complementary', { name: 'Illustrative Python trace' })).toBeVisible()
	const running = await page.evaluate(() =>
		document
			.getAnimations()
			.some((animation) => animation instanceof CSSAnimation && animation.animationName === 'slot')
	)
	expect(running).toBe(false)
})

test('AC12: auth forms stay neutral white when the device prefers dark mode', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' })
	for (const path of ['/login', '/register']) {
		await page.goto(path)
		const formSurface = page.getByRole('heading', { level: 1 }).locator('..')
		await expect(formSurface).toHaveCSS('background-color', 'rgb(255, 255, 255)')
		await expect(page.getByLabel('Email')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
	}
})
