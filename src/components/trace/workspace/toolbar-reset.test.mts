import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const ws = read('../practice-workspace.tsx')
const shellCss = read('../../app-shell/app-shell.module.css')

describe('practice toolbar layout reset', () => {
	it('sits after the stopwatch and before the workspace-tour button', () => {
		const stopwatch = ws.indexOf('<Stopwatch')
		const reset = ws.indexOf('id="reset-practice"')
		const tour = ws.indexOf('aria-label="Show the workspace tour"')
		assert.ok(stopwatch > 0 && reset > stopwatch && tour > reset)
	})

	it('is an accessible "Reset layout" button that never asks to discard anything', () => {
		assert.match(ws, /aria-label="Reset layout"/)
		assert.match(ws, /onClick=\{resetLayout\}/)
		assert.doesNotMatch(ws, /window\.confirm\(/)
	})

	it('only resets pane sizes: it clears no code, results, replay, History, chat or timer', () => {
		const body = ws.slice(ws.indexOf('function resetLayout()'), ws.indexOf('function closeTutor()'))
		assert.match(body, /layoutApiRef\.current\?\.reset\(\)/)
		assert.doesNotMatch(
			body,
			/setCode|setSubmitted|setReplay|setAttempts|setNotice|tutor\.|Stopwatch/
		)
	})

	it('layout reset restores the defaults for all four panes and un-maximizes', () => {
		const layout = read('./workspace-layout.tsx')
		const fn = layout.slice(
			layout.indexOf('useImperativeHandle'),
			layout.indexOf('function toggleMax')
		)
		assert.match(fn, /setMaximized\(null\)/)
		assert.match(fn, /commit\(DEFAULT_LAYOUT\)/)
	})

	it('DEFAULT_LAYOUT is the default size and expanded state for every pane', async () => {
		const { DEFAULT_LAYOUT, LAYOUT_DEFAULTS } = await import('@/lib/trace/workspace-layout')
		assert.deepEqual(DEFAULT_LAYOUT, {
			left: LAYOUT_DEFAULTS.left,
			top: LAYOUT_DEFAULTS.top,
			tutor: LAYOUT_DEFAULTS.tutor,
			leftCollapsed: false,
			resultsCollapsed: false,
			codeCollapsed: false
		})
	})
})

describe('collapsed sidebar hover labels', () => {
	it('the sidebar stacks above the content so labels are not hidden behind it', () => {
		const rule = shellCss.match(/\.sidebar \{[^}]*\}/)![0]
		assert.match(rule, /z-index:\s*30/)
		assert.match(shellCss, /\.frame\[data-collapsed='true'\] \.sidebarCard \{\s*overflow: visible/)
	})
})
