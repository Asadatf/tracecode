import type { Value } from './contract'

// Structural equality for two tagged Values — used to detect variable changes
// between trace steps. Order-sensitive for dict entries (a Python dict snapshot
// preserves insertion order, so a reordering is a genuine change).
export function valueEquals(a: Value, b: Value): boolean {
	switch (a.kind) {
		case 'int':
		case 'float':
			return (b.kind === 'int' || b.kind === 'float') && a.value === b.value
		case 'bool':
			return b.kind === 'bool' && a.value === b.value
		case 'str':
			return b.kind === 'str' && a.value === b.value
		case 'none':
			return b.kind === 'none'
		case 'list':
		case 'tuple': {
			if ((b.kind !== 'list' && b.kind !== 'tuple') || a.items.length !== b.items.length)
				return false
			return a.items.every((item, i) => {
				const other = b.items[i]
				return other != null && valueEquals(item, other)
			})
		}
		case 'dict': {
			if (b.kind !== 'dict' || a.entries.length !== b.entries.length) return false
			return a.entries.every(([key, value], i) => {
				const other = b.entries[i]
				return other != null && valueEquals(key, other[0]) && valueEquals(value, other[1])
			})
		}
		case 'other':
			return b.kind === 'other' && a.repr === b.repr
	}
}

// A Python-flavoured, readable rendering of a Value for explanations:
// [3, 2, 4], True, None, 'hi', {3: 0}. A truncated collection shows a trailing …
export function formatValue(value: Value): string {
	switch (value.kind) {
		case 'int':
		case 'float':
			return String(value.value)
		case 'bool':
			return value.value ? 'True' : 'False'
		case 'str':
			return `'${value.value}'`
		case 'none':
			return 'None'
		case 'list': {
			const inner = value.items.map(formatValue).concat(value.truncated === true ? ['…'] : [])
			return `[${inner.join(', ')}]`
		}
		case 'tuple': {
			const inner = value.items.map(formatValue).concat(value.truncated === true ? ['…'] : [])
			return `(${inner.join(', ')})`
		}
		case 'dict': {
			const inner = value.entries
				.map(([k, v]) => `${formatValue(k)}: ${formatValue(v)}`)
				.concat(value.truncated === true ? ['…'] : [])
			return `{${inner.join(', ')}}`
		}
		case 'other':
			return value.repr
	}
}

// The int value of a local if it is an int, else null (pointers only exist for ints).
export function intValue(value: Value | undefined): number | null {
	return value != null && value.kind === 'int' ? value.value : null
}

// The item Values of a list/tuple local, else null (so the array view can read cells).
export function listItems(value: Value | undefined): Value[] | null {
	return value != null && (value.kind === 'list' || value.kind === 'tuple') ? value.items : null
}
