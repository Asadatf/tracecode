// The editor's Format button (specs/features/practice-workspace-layout.md AC14):
// corrects indentation only. Each block level becomes exactly four spaces, tabs
// are expanded the way Python reads them, and trailing spaces and blank lines at
// the end are removed. It never reorders or rewrites code:
//  - comment-only lines take the indentation of the code line after them;
//  - lines inside brackets, or after a backslash, keep their offset from the
//    statement's first line, so hanging indents stay aligned;
//  - lines inside a triple-quoted string are left exactly as written;
//  - indentation Python itself would reject is reported, with the line, and the
//    code is returned unchanged.

const INDENT = '    '
const TAB_STOP = 8

export interface FormatResult {
	text: string
	status: 'formatted' | 'unchanged' | 'error'
	// 1-based line of the problem when status is 'error'.
	line?: number
	reason?: 'dedent' | 'missing-indent'
}

function indentWidth(line: string): number {
	let width = 0
	for (const char of line) {
		if (char === ' ') width += 1
		else if (char === '\t') width += TAB_STOP - (width % TAB_STOP)
		else break
	}
	return width
}

interface ScanState {
	depth: number
	// The open triple quote, while inside a multi-line string.
	triple: '"""' | "'''" | null
}

// Advances bracket depth and triple-quote state over one line, skipping
// comments and ordinary strings.
function scanLine(line: string, state: ScanState): ScanState {
	let { depth, triple } = state
	let i = 0
	while (i < line.length) {
		if (triple != null) {
			const end = line.indexOf(triple, i)
			if (end === -1) return { depth, triple }
			i = end + 3
			triple = null
			continue
		}
		const char = line[i]
		if (char === '#') break
		if (char === '"' || char === "'") {
			const three = line.slice(i, i + 3)
			if (three === '"""' || three === "'''") {
				triple = three
				i += 3
				continue
			}
			i += 1
			while (i < line.length && line[i] !== char) i += line[i] === '\\' ? 2 : 1
			i += 1
			continue
		}
		if (char === '(' || char === '[' || char === '{') depth += 1
		else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1)
		i += 1
	}
	return { depth, triple }
}

// The line without a trailing comment (a '#' outside any string).
function withoutComment(line: string): string {
	let quote: string | null = null
	for (let i = 0; i < line.length; i++) {
		const char = line[i]
		if (quote != null) {
			if (char === '\\') i += 1
			else if (char === quote) quote = null
		} else if (char === '"' || char === "'") quote = char
		else if (char === '#') return line.slice(0, i)
	}
	return line
}

export function formatPython(source: string): FormatResult {
	const lines = source.replace(/\r\n?/g, '\n').split('\n')
	const out: string[] = []
	// Blank lines and comments waiting for the next code line's indentation.
	let pending: string[] = []
	const stack = [0]
	let state: ScanState = { depth: 0, triple: null }
	let statementOriginal = 0
	let statementIndent = 0
	let backslash = false
	let expectBlock = false
	let blockOpenerWidth = 0

	function flush(indent: string) {
		for (const entry of pending) out.push(entry === '' ? '' : indent + entry)
		pending = []
	}

	for (const [index, raw] of lines.entries()) {
		const before = state
		state = scanLine(raw, before)
		if (before.triple != null) {
			out.push(raw)
			continue
		}
		const text = raw.trimEnd()
		const trimmed = text.trim()

		if (before.depth > 0 || backslash) {
			const offset = Math.max(0, indentWidth(text) - statementOriginal)
			out.push(trimmed === '' ? '' : ' '.repeat(statementIndent + offset) + trimmed)
			backslash = text.endsWith('\\')
			continue
		}
		if (trimmed === '') {
			pending.push('')
			continue
		}
		if (trimmed.startsWith('#')) {
			pending.push(trimmed)
			continue
		}

		const width = indentWidth(text)
		if (expectBlock && width <= blockOpenerWidth) {
			return { text: source, status: 'error', line: index + 1, reason: 'missing-indent' }
		}
		if (width > (stack[stack.length - 1] ?? 0)) stack.push(width)
		else {
			while (stack.length > 1 && (stack[stack.length - 1] ?? 0) > width) stack.pop()
			// A dedent to a width no open block used: Python's IndentationError.
			if ((stack[stack.length - 1] ?? 0) !== width) {
				return { text: source, status: 'error', line: index + 1, reason: 'dedent' }
			}
		}
		const indent = INDENT.repeat(stack.length - 1)
		flush(indent)
		out.push(indent + trimmed)
		statementOriginal = width
		statementIndent = indent.length
		backslash = text.endsWith('\\')
		expectBlock = state.depth === 0 && withoutComment(text).trimEnd().endsWith(':')
		blockOpenerWidth = width
	}

	flush(INDENT.repeat(stack.length - 1))
	while (out.length > 0 && out[out.length - 1] === '') out.pop()
	const formatted = out.join('\n')
	return { text: formatted, status: formatted === source ? 'unchanged' : 'formatted' }
}
