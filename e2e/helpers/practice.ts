import type { Locator, Page } from '@playwright/test'

// Shared helpers for practice-workspace e2e tests.

// Set a controlled React textarea reliably — fill() does not clear it. Uses the
// native value setter + a bubbling input event so React's onChange fires with
// the full replacement text.
export async function setEditor(editor: Locator, text: string) {
	await editor.evaluate((el, value) => {
		const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
		if (setter != null) setter.call(el, value)
		el.dispatchEvent(new Event('input', { bubbles: true }))
	}, text)
}

// Typing before React attaches to the editor would be overwritten on hydration.
export async function hydrated(page: Page) {
	await page.waitForFunction(() => {
		const el = document.querySelector('textarea')
		return el != null && Object.keys(el).some((key) => key.startsWith('__reactProps'))
	})
}

// The first-visit tour covers part of the workspace; mark it seen.
export async function skipTour(page: Page) {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('tc-practice-tour-v1', '1')
		} catch {
			// storage unavailable: the tour just shows
		}
	})
}

export const TWO_SUM_PASSING = `def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []`

export const TWO_SUM_BUGGY = `def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []`
