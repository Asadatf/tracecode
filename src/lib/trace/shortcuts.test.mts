import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPlatform, matchShortcut, shortcutKeys, type KeyLike } from './shortcuts'

// specs/features/workspace-shortcuts.md

const key = (over: Partial<KeyLike>): KeyLike => ({
	key: '',
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	inTextField: true,
	...over
})

test('AC1: Ctrl+Enter runs on every platform; Cmd+Enter also runs on macOS', () => {
	assert.equal(matchShortcut(key({ key: 'Enter', ctrlKey: true }), 'other'), 'run')
	assert.equal(matchShortcut(key({ key: 'Enter', ctrlKey: true }), 'mac'), 'run')
	assert.equal(matchShortcut(key({ key: 'Enter', metaKey: true }), 'mac'), 'run')
	assert.equal(matchShortcut(key({ key: 'Enter', metaKey: true }), 'other'), null)
})

test('AC6: plain Enter and Shift+Enter are never shortcuts', () => {
	assert.equal(matchShortcut(key({ key: 'Enter' }), 'mac'), null)
	assert.equal(matchShortcut(key({ key: 'Enter', shiftKey: true, ctrlKey: true }), 'other'), null)
})

test('AC3: Shift+Alt+F formats, including the macOS Option symbol', () => {
	assert.equal(matchShortcut(key({ key: 'F', shiftKey: true, altKey: true }), 'other'), 'format')
	assert.equal(matchShortcut(key({ key: 'Ï', shiftKey: true, altKey: true }), 'mac'), 'format')
	assert.equal(matchShortcut(key({ key: 'F', shiftKey: true }), 'other'), null)
	assert.equal(
		matchShortcut(key({ key: 'F', shiftKey: true, altKey: true, ctrlKey: true }), 'other'),
		null
	)
})

test('AC4: ? opens help only outside text fields', () => {
	assert.equal(matchShortcut(key({ key: '?', shiftKey: true, inTextField: false }), 'mac'), 'help')
	assert.equal(matchShortcut(key({ key: '?', shiftKey: true, inTextField: true }), 'mac'), null)
})

test('AC5: tooltips name the right keys per platform', () => {
	assert.equal(shortcutKeys('run', 'mac'), '⌘ Enter')
	assert.equal(shortcutKeys('run', 'other'), 'Ctrl Enter')
	assert.equal(shortcutKeys('format', 'other'), 'Shift Alt F')
})

test('platform detection', () => {
	assert.equal(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'mac')
	assert.equal(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'other')
	assert.equal(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)'), 'other')
})
