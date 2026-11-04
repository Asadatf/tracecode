import { test, expect, type Page, type Route } from '@playwright/test'
import { hasLearner, openAsLearner } from './helpers/auth'

// Tracy, the Practice Workspace's AI tutor (specs/features/practice-workspace-layout.md
// AC16-AC24 for the panel, specs/features/contextual-ai-tutor.md for the behaviour).
//
// Two groups:
//   1. The panel, fullscreen, guide and layout reset, as a GUEST on Two Sum. These
//      always run, need no account and never call a model.
//   2. Sending, streaming, Stop, retry and the 15-question limit, as a signed-in
//      learner. Like the other signed-in specs they run only when
//      E2E_LEARNER_EMAIL / E2E_LEARNER_PASSWORD are set (see helpers/auth.ts).
//      /api/tutor is always mocked here; no test ever reaches OpenAI.

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

const toggle = (page: Page) => page.getByRole('button', { name: 'Ask Tracy', exact: true })
const tutor = (page: Page) => page.locator('#pane-tutor')
// Pane widths animate for 150ms, so measure once they have settled.
const tutorWidth = (page: Page) => async () => Math.round((await tutor(page).boundingBox())!.width)
const tutorCalls = (page: Page) => {
	const urls: string[] = []
	page.on('request', (request) => {
		if (request.url().includes('/api/tutor')) urls.push(request.url())
	})
	return urls
}

// ───────────────────────── the panel (guest) ─────────────────────────

test('AC16: Tracy is closed by default and opens into a third full-height column', async ({
	page
}) => {
	await open(page)
	await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
	await expect(tutor(page)).toBeHidden()

	await toggle(page).click()
	await expect(tutor(page)).toBeVisible()
	await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
	await page.waitForTimeout(400) // let the 150ms open transition finish

	const left = (await page.locator('#pane-left').boundingBox())!
	const code = (await page.locator('#pane-code').boundingBox())!
	const results = (await page.locator('#pane-results').boundingBox())!
	const box = (await tutor(page).boundingBox())!
	// Three columns left to right, Tracy spanning code and results together.
	expect(left.x + left.width).toBeLessThanOrEqual(code.x)
	expect(code.x + code.width).toBeLessThanOrEqual(box.x + 1)
	expect(box.y).toBeLessThanOrEqual(code.y + 1)
	expect(box.y + box.height).toBeGreaterThanOrEqual(results.y + results.height - 1)
	// Code and results stay stacked in the middle column.
	expect(Math.abs(code.x - results.x)).toBeLessThanOrEqual(1)
})

test('the header names Tracy with an AI Tutor subtitle, the greeting and the topic chips', async ({
	page
}) => {
	await open(page)
	await toggle(page).click()
	await expect(page.getByRole('heading', { name: 'Tracy', exact: true })).toBeVisible()
	await expect(tutor(page).getByText('AI Tutor', { exact: true })).toBeVisible()
	await expect(page.getByText("Hi, I'm Tracy!")).toBeVisible()
	await expect(
		page.getByText(/help you understand your code, debug mistakes, and learn the concepts/)
	).toBeVisible()
	// Topics come from the problem's catalog tags.
	for (const topic of ['arrays', 'loops']) {
		await expect(tutor(page).getByText(topic, { exact: true })).toBeVisible()
	}
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

test('AC17: dragging the splitter resizes the panel', async ({ page }) => {
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
	await page.getByRole('button', { name: 'Maximize Tracy' }).click()
	await expect.poll(tutorWidth(page)).toBeGreaterThan(normal * 2)
	await page.getByRole('button', { name: 'Restore Tracy size' }).click()
	await expect.poll(async () => Math.abs((await tutorWidth(page)()) - normal)).toBeLessThan(2)

	await page.getByRole('button', { name: 'Maximize Tracy' }).click()
	await page.keyboard.press('Escape')
	await expect(tutor(page)).toBeVisible()
	await expect.poll(async () => Math.abs((await tutorWidth(page)()) - normal)).toBeLessThan(2)
})

test('fullscreen keeps the conversation and composer to a centred, readable column', async ({
	page
}) => {
	await open(page, 1800, 900)
	await toggle(page).click()
	await page.waitForTimeout(400)
	const normalLog = (await page.locator('[role="log"]').boundingBox())!.width
	await page.getByRole('button', { name: 'Maximize Tracy' }).click()
	await expect.poll(tutorWidth(page)).toBeGreaterThan(1200)

	const pane = (await tutor(page).boundingBox())!
	// The composer is measured as a whole (the message box plus the send button).
	for (const selector of ['[role="log"]', 'form:has(#tutor-message)']) {
		const box = (await page.locator(selector).boundingBox())!
		expect(box.width, `${selector} is capped near 960px`).toBeLessThanOrEqual(962)
		expect(box.width).toBeGreaterThan(600)
		// Centred: the space left and right of it matches.
		const leftGap = box.x - pane.x
		const rightGap = pane.x + pane.width - (box.x + box.width)
		expect(Math.abs(leftGap - rightGap), `${selector} is centred`).toBeLessThanOrEqual(24)
	}
	// The compact panel is untouched: it was a narrow column before maximizing.
	expect(normalLog).toBeLessThan(700)
})

test('AC20: Escape and the close button close it and return focus to the toolbar button', async ({
	page
}) => {
	await open(page)
	await toggle(page).click()
	await expect(page.getByRole('heading', { name: 'Tracy', exact: true })).toBeFocused()
	await page.keyboard.press('Escape')
	await expect(tutor(page)).toBeHidden()
	await expect(toggle(page)).toBeFocused()

	await toggle(page).click()
	await page.getByRole('button', { name: 'Close Tracy' }).click()
	await expect(tutor(page)).toBeHidden()
	await expect(toggle(page)).toBeFocused()
})

test('a guest is told to sign in, the composer is off, and nothing is sent to the tutor API', async ({
	page
}) => {
	const calls = tutorCalls(page)
	await open(page)
	await toggle(page).click()
	await expect(tutor(page).getByRole('note')).toContainText('Sign in to chat with Tracy.')
	await expect(page.getByLabel('Message to Tracy')).toBeDisabled()
	await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled()
	await expect(page.getByText('Two Sum').last()).toBeVisible()
	// Opening the panel sends nothing, and so does the editor.
	await setEditor(page, BUGGY)
	expect(calls).toEqual([])
})

test('AC22: on a mid-width screen it is a drawer that traps focus and leaves the editor alone', async ({
	page
}) => {
	await open(page, 900, 800)
	const codeBefore = (await page.locator('#pane-code').boundingBox())!
	await toggle(page).click()
	await expect(page.getByRole('dialog', { name: /Tracy/ })).toBeVisible()
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
	await expect(page.getByRole('button', { name: 'Maximize Tracy' })).toHaveCount(0)
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	await page.getByRole('button', { name: 'Close Tracy' }).click()
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

// ───────────────────────── the prompt guide (guest) ─────────────────────────

const GUIDE_LABELS = [
	'Learn a topic',
	'Get a conceptual hint',
	'Understand failed tests',
	'Explore execution',
	'Optimize my solution',
	'Review my solution'
]

test('the guide opens beside the title, lists six categories, and is not a chat message', async ({
	page
}) => {
	const calls = tutorCalls(page)
	await open(page)
	await toggle(page).click()
	// The button is named "How to ask Tracy (guide)" and "Close prompt guide" once open,
	// so it is found by id after that.
	const trigger = page.locator('#tutor-guide-trigger')
	await expect(page.getByRole('button', { name: 'How to ask Tracy (guide)' })).toBeVisible()
	await expect(trigger).toHaveAttribute('aria-expanded', 'false')
	await trigger.click()
	await expect(trigger).toHaveAttribute('aria-expanded', 'true')

	const guide = page.getByRole('dialog', { name: 'How to ask Tracy (guide)' })
	await expect(guide).toBeVisible()
	for (const label of GUIDE_LABELS)
		await expect(guide.getByText(label, { exact: true })).toBeVisible()
	await expect(guide.getByText(/uses the relevant context available/)).toBeVisible()
	await expect(guide.getByText(/need a run first/)).toBeVisible()

	// It is not part of the conversation, and opening it made no request.
	await expect(page.locator('[role="log"]').getByText('How to ask Tracy')).toHaveCount(0)
	expect(await guide.evaluate((el) => el.closest('[role="log"]') == null)).toBe(true)
	expect(calls).toEqual([])
	// No em dashes in the guide's copy.
	expect(await guide.innerText()).not.toContain('—')
})

test('each guide example copies its prompt without sending it', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	const calls = tutorCalls(page)
	await open(page)
	await toggle(page).click()
	await page.getByRole('button', { name: 'How to ask Tracy (guide)' }).click()

	await page.getByRole('button', { name: 'Copy Get a conceptual hint prompt' }).click()
	await expect(
		page.getByRole('button', { name: /Copied Get a conceptual hint prompt/ })
	).toBeVisible()
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		'Give me a conceptual hint about my current approach without revealing the solution.'
	)
	// Copying never fills the composer, never sends, never starts a chat.
	await expect(page.getByLabel('Message to Tracy')).toHaveValue('')
	expect(calls).toEqual([])
	await expect(page.getByText('0 / 15 questions used')).toBeVisible()
})

test('the guide is keyboard operable: Escape closes it and focus returns to the info button', async ({
	page
}) => {
	await open(page)
	await toggle(page).click()
	const trigger = page.locator('#tutor-guide-trigger')
	await trigger.focus()
	await page.keyboard.press('Enter')
	await expect(page.getByRole('heading', { name: 'How to ask Tracy (guide)' })).toBeFocused()
	// Tab stays inside the dialog.
	for (let i = 0; i < 16; i++) await page.keyboard.press('Tab')
	expect(
		await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null)
	).toBe(true)
	await page.keyboard.press('Escape')
	await expect(page.getByRole('dialog', { name: 'How to ask Tracy (guide)' })).toBeHidden()
	// Tracy itself is still open: Escape closed only the guide.
	await expect(tutor(page)).toBeVisible()
	await expect(trigger).toBeFocused()
})

// ───────────────────────── reset layout (guest) ─────────────────────────

test('Reset layout restores every pane size and clears nothing the learner did', async ({
	page
}) => {
	await open(page)
	await setEditor(page, BUGGY)
	await toggle(page).click()
	await page.waitForTimeout(400)
	const defaults = {
		tutor: await tutorWidth(page)(),
		left: Math.round((await page.locator('#pane-left').boundingBox())!.width),
		codeHeight: Math.round((await page.locator('#pane-code').boundingBox())!.height)
	}

	// Change all four panes: Tracy's width, the challenge width, the code height, maximize.
	await page.locator('#tutor-splitter').focus()
	await page.keyboard.press('Shift+ArrowLeft')
	await page.locator('#tour-split-v').focus()
	await page.keyboard.press('Shift+ArrowRight')
	await page.getByRole('separator', { name: 'Resize code and results panes' }).focus()
	await page.keyboard.press('Shift+ArrowDown')
	await expect.poll(tutorWidth(page)).not.toBe(defaults.tutor)
	await page.getByRole('button', { name: 'Maximize Tracy' }).click()
	await expect.poll(tutorWidth(page)).toBeGreaterThan(defaults.tutor * 2)

	await page.getByRole('button', { name: 'Reset layout' }).click()

	await expect
		.poll(async () => Math.abs((await tutorWidth(page)()) - defaults.tutor))
		.toBeLessThan(3)
	await expect
		.poll(async () =>
			Math.abs(Math.round((await page.locator('#pane-left').boundingBox())!.width) - defaults.left)
		)
		.toBeLessThan(3)
	await expect
		.poll(async () =>
			Math.abs(
				Math.round((await page.locator('#pane-code').boundingBox())!.height) - defaults.codeHeight
			)
		)
		.toBeLessThan(3)

	// Only sizes changed: the code is still there, and Tracy is still open.
	await expect(page.getByLabel('Python code editor')).toHaveValue(BUGGY)
	await expect(tutor(page)).toBeVisible()
	// And the defaults are what a refresh restores (the saved sizes were reset too).
	await page.reload()
	await hydrated(page)
	await toggle(page).click()
	await page.waitForTimeout(400)
	await expect
		.poll(async () => Math.abs((await tutorWidth(page)()) - defaults.tutor))
		.toBeLessThan(3)
})

// ───────────────────── sending, streaming, Stop and retry (signed in) ─────────────────────
//
// /api/tutor is mocked. Each reply is the same NDJSON the real route sends:
// one JSON event per line, ending in `done`. A stream with no `done` is a
// cut-off reply.

const ndjson = (events: object[]) => events.map((e) => JSON.stringify(e)).join('\n') + '\n'
const reply = (text: string, chunks = 3) => {
	const size = Math.ceil(text.length / chunks)
	const deltas = Array.from({ length: chunks }, (_, i) => ({
		type: 'delta',
		text: text.slice(i * size, (i + 1) * size)
	})).filter((d) => d.text !== '')
	return ndjson([{ type: 'start' }, ...deltas, { type: 'done' }])
}
const fulfillStream = (route: Route, body: string) =>
	route.fulfill({ status: 200, contentType: 'application/x-ndjson; charset=utf-8', body })

const ANSWER = 'Your inner loop starts at the wrong index. Want a stronger hint?'
const composer = (page: Page) => page.getByLabel('Message to Tracy')
const counter = (page: Page, used: number) => page.getByText(`${used} / 15 questions used`)
const ask = async (page: Page, text: string) => {
	await composer(page).fill(text)
	await page.getByRole('button', { name: 'Send message' }).click()
}

async function openTracySignedIn(page: Page, path = '/practice/two-sum') {
	await openAsLearner(page, path)
	await hydrated(page)
	await page.setViewportSize({ width: 1440, height: 860 })
	await toggle(page).click()
	await expect(composer(page)).toBeEnabled()
}

test.describe('signed in (mocked tutor API)', () => {
	test.skip(!hasLearner, 'Set E2E_LEARNER_EMAIL / E2E_LEARNER_PASSWORD to run signed-in specs')

	test('sending shows the question, streams the reply, counts one question and survives a refresh', async ({
		page
	}) => {
		const sent: string[] = []
		await page.route('**/api/tutor', (route) => {
			sent.push(route.request().postData() ?? '')
			return fulfillStream(route, reply('Here is a **conceptual** hint.\n\n```python\nx = 1\n```'))
		})
		await openTracySignedIn(page)
		expect(sent).toEqual([]) // opening Tracy sent nothing
		await setEditor(page, BUGGY)
		await ask(page, 'Why are my tests failing?')

		const log = page.locator('[role="log"]')
		await expect(log.getByText('Why are my tests failing?')).toBeVisible()
		await expect(log.getByText('conceptual', { exact: true })).toBeVisible()
		await expect(log.locator('pre')).toContainText('x = 1')
		await expect(log.getByRole('button', { name: /Copy code to clipboard/ })).toBeVisible()
		await expect(counter(page, 1)).toBeVisible()

		// The request carried the learner's code only because they pressed Send.
		const payload = JSON.parse(sent[0] ?? '{}') as {
			problemSlug: string
			context: { code?: string }
		}
		expect(payload.problemSlug).toBe('two-sum')
		expect(payload.context.code).toBe(BUGGY)
		expect(sent[0]).not.toMatch(/sk-|api[_-]?key/i)

		await page.reload()
		await hydrated(page)
		await toggle(page).click()
		await expect(page.locator('[role="log"]').getByText('Why are my tests failing?')).toBeVisible()
		await expect(counter(page, 1)).toBeVisible()
	})

	test('Stop keeps the question for one-click retry and does not count it', async ({ page }) => {
		let release: () => void = () => {}
		const hold = new Promise<void>((resolve) => (release = resolve))
		let calls = 0
		await page.route('**/api/tutor', async (route) => {
			calls += 1
			if (calls === 1) {
				await hold // a slow first reply, until the test releases it
				return route.abort()
			}
			return fulfillStream(route, reply(ANSWER))
		})
		await openTracySignedIn(page)
		await ask(page, 'Explain my approach')
		const stop = page.getByRole('button', { name: 'Stop generating' })
		await expect(stop).toBeVisible()
		await expect(composer(page)).toBeDisabled() // no second send while one is running
		await stop.click()

		await expect(page.getByText('Stopped. That question was not counted.')).toBeVisible()
		await expect(counter(page, 0)).toBeVisible()
		const log = page.locator('[role="log"]')
		await expect(log.getByText('Tracy', { exact: true })).toHaveCount(0) // no partial answer
		release()

		// Retry resends the same question: no retyping, and no duplicate user message.
		await page.getByRole('button', { name: 'Retry' }).click()
		await expect(log.getByText(ANSWER)).toBeVisible()
		await expect(log.getByText('Explain my approach')).toHaveCount(1)
		await expect(counter(page, 1)).toBeVisible()
	})

	test('a reply that is cut off is an error with retry, not an answer, and costs no question', async ({
		page
	}) => {
		let calls = 0
		await page.route('**/api/tutor', (route) => {
			calls += 1
			// First reply stops mid-sentence: no `done` event.
			if (calls === 1) {
				return fulfillStream(
					route,
					ndjson([{ type: 'start' }, { type: 'delta', text: 'Half an answ' }])
				)
			}
			return fulfillStream(route, reply(ANSWER))
		})
		await openTracySignedIn(page)
		await ask(page, 'Why is this slow?')
		await expect(page.getByRole('alert')).toContainText('cut off')
		await expect(counter(page, 0)).toBeVisible()
		await expect(page.locator('[role="log"]').getByText('Half an answ')).toHaveCount(0)

		await page.getByRole('button', { name: 'Try again' }).click()
		await expect(page.locator('[role="log"]').getByText(ANSWER)).toBeVisible()
		await expect(page.locator('[role="log"]').getByText('Why is this slow?')).toHaveCount(1)
		await expect(counter(page, 1)).toBeVisible()
	})

	test('a provider error shows a clear message, keeps the chat, and can be retried', async ({
		page
	}) => {
		let calls = 0
		await page.route('**/api/tutor', (route) => {
			calls += 1
			if (calls === 1) {
				return fulfillStream(
					route,
					ndjson([
						{ type: 'start' },
						{
							type: 'error',
							reason: 'unavailable',
							message: 'The AI provider is having trouble. Try again.'
						}
					])
				)
			}
			return fulfillStream(route, reply(ANSWER))
		})
		await openTracySignedIn(page)
		await setEditor(page, BUGGY)
		await ask(page, 'Help?')
		await expect(page.getByRole('alert')).toContainText('having trouble')
		await expect(counter(page, 0)).toBeVisible()
		// Practice is unaffected.
		await expect(page.getByLabel('Python code editor')).toHaveValue(BUGGY)
		await page.getByRole('button', { name: 'Try again' }).click()
		await expect(page.locator('[role="log"]').getByText(ANSWER)).toBeVisible()
	})

	test('fifteen questions fill the chat, it turns read-only, and a new chat starts fresh', async ({
		page
	}) => {
		test.setTimeout(120_000)
		await page.route('**/api/tutor', (route) => fulfillStream(route, reply('Noted.', 1)))
		await openTracySignedIn(page)
		for (let n = 1; n <= 15; n += 1) {
			await ask(page, `Question ${n}`)
			await expect(counter(page, n)).toBeVisible()
		}
		await expect(page.getByText(/asked all 15 questions/)).toBeVisible()
		await expect(composer(page)).toBeDisabled()
		await expect(
			page.locator('[role="log"]').getByText('Question 1', { exact: true })
		).toBeVisible()

		await page.getByRole('button', { name: 'Start new chat' }).click()
		await expect(counter(page, 0)).toBeVisible()
		await expect(composer(page)).toBeEnabled()
		await expect(page.locator('[role="log"]').getByText('Question 1', { exact: true })).toHaveCount(
			0
		)
	})

	test('switching problems during a reply never puts it in the other problem’s chat', async ({
		page
	}) => {
		let release: () => void = () => {}
		const hold = new Promise<void>((resolve) => (release = resolve))
		await page.route('**/api/tutor', async (route) => {
			await hold
			return fulfillStream(route, reply('This belongs to Two Sum.'))
		})
		await openTracySignedIn(page)
		await ask(page, 'A question about Two Sum')
		await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible()

		await page.getByLabel('Choose problem').selectOption('contains-duplicate')
		await page.waitForURL(/contains-duplicate/)
		await hydrated(page)
		release() // the old request finishes now, too late

		await toggle(page).click()
		await expect(counter(page, 0)).toBeVisible()
		const log = page.locator('[role="log"]')
		await expect(log.getByText('This belongs to Two Sum.')).toHaveCount(0)
		await expect(log.getByText('A question about Two Sum')).toHaveCount(0)

		// Going back: the unfinished question was never saved, so Two Sum is clean too.
		await page.getByLabel('Choose problem').selectOption('two-sum')
		await page.waitForURL(/two-sum/)
		await hydrated(page)
		await toggle(page).click()
		await expect(counter(page, 0)).toBeVisible()
	})
})
