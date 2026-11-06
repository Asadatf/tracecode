// Keyboard shortcuts for the practice workspace
// (specs/features/workspace-shortcuts.md). Pure matching over the few event
// fields it needs, so it unit-tests without a DOM.

export type ShortcutAction = 'run' | 'format' | 'help'
export type Platform = 'mac' | 'other'

export interface KeyLike {
	key: string
	ctrlKey: boolean
	metaKey: boolean
	shiftKey: boolean
	altKey: boolean
	// True when focus is in a text field (the editor, an input, a textarea).
	inTextField: boolean
}

export interface ShortcutDoc {
	action: ShortcutAction
	label: string
	keys: Record<Platform, string>
}

export const SHORTCUTS: readonly ShortcutDoc[] = [
	{ action: 'run', label: 'Run code', keys: { mac: '⌘ Enter', other: 'Ctrl Enter' } },
	{ action: 'format', label: 'Format code', keys: { mac: '⇧ ⌥ F', other: 'Shift Alt F' } },
	{ action: 'help', label: 'Show shortcuts', keys: { mac: '?', other: '?' } }
]

export function shortcutKeys(action: ShortcutAction, platform: Platform): string {
	return SHORTCUTS.find((s) => s.action === action)?.keys[platform] ?? ''
}

export function matchShortcut(event: KeyLike, platform: Platform): ShortcutAction | null {
	// Run: Ctrl+Enter everywhere; Cmd+Enter as well on macOS, so an external
	// keyboard with either habit works (AC1).
	if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
		if (event.ctrlKey || (platform === 'mac' && event.metaKey)) return 'run'
		return null
	}
	// Format: Shift+Alt+F, as in VS Code. On macOS Option changes event.key to
	// a symbol (Ï), so the physical key is matched through `key` lower-cased or
	// the symbol (AC3).
	if (
		event.shiftKey &&
		event.altKey &&
		!event.ctrlKey &&
		!event.metaKey &&
		(event.key.toLowerCase() === 'f' || event.key === 'Ï')
	) {
		return 'format'
	}
	// Help: a plain `?` outside text fields only, so typing `?` in code works (AC4).
	if (
		event.key === '?' &&
		!event.inTextField &&
		!event.ctrlKey &&
		!event.metaKey &&
		!event.altKey
	) {
		return 'help'
	}
	return null
}

export function detectPlatform(userAgent: string): Platform {
	return /Mac|iPhone|iPad|iPod/i.test(userAgent) ? 'mac' : 'other'
}
