// Whether a submitted Python source is a real change from the problem's starter
// (specs/features/streak.md AC4). Deterministic, no execution, no AI, no I/O.
//
// Two sources are the SAME when they tokenise to the same logical lines at the
// same block depth. That ignores exactly what the streak rule says to ignore:
// whitespace (spacing, blank lines, indent width, line continuations, newlines
// inside brackets) and comments. Everything else is preserved: identifiers,
// literals (string contents are compared byte for byte), operators, and block
// structure (re-indenting a line into a different block changes its depth).
//
// It only ever answers "is this the untouched starter?". It never judges whether
// code is correct or a good solution, so any genuinely different program passes.
// Known limits, all in the generous direction: adding a docstring, a `pass`, or
// a dead assignment counts as a change; the check cannot tell effort from
// padding, and does not try to.

interface CanonicalLine {
	depth: number
	tokens: string[]
}

const TAB_WIDTH = 8
const STRING_PREFIXES = new Set(['r', 'u', 'b', 'f', 'rb', 'br', 'fr', 'rf'])
const OPENERS = '([{'
const CLOSERS = ')]}'

function isWordChar(char: string): boolean {
	return /[A-Za-z0-9_]/.test(char) || char.charCodeAt(0) > 127
}

// The end index (exclusive) of the string literal whose opening quote is at `start`.
function stringEnd(src: string, start: number): number {
	const quote = src[start] ?? ''
	const triple = src.startsWith(quote.repeat(3), start)
	let i = start + (triple ? 3 : 1)
	while (i < src.length) {
		const char = src[i]
		if (char === '\\') {
			i += 2
			continue
		}
		if (triple ? src.startsWith(quote.repeat(3), i) : char === quote) return i + (triple ? 3 : 1)
		// An unterminated one-line string ends at the line (invalid Python anyway).
		if (!triple && char === '\n') return i
		i += 1
	}
	return src.length
}

export function canonicalPython(source: string): CanonicalLine[] {
	const src = source.replace(/\r\n?/g, '\n')
	const lines: CanonicalLine[] = []
	const indentStack = [0]
	let tokens: string[] = []
	let width = 0
	let brackets = 0
	let atLineStart = true
	let i = 0

	function endLine() {
		if (tokens.length === 0) return
		while (indentStack.length > 1 && width < (indentStack[indentStack.length - 1] ?? 0)) {
			indentStack.pop()
		}
		if (width > (indentStack[indentStack.length - 1] ?? 0)) indentStack.push(width)
		lines.push({ depth: indentStack.length - 1, tokens })
		tokens = []
	}

	while (i < src.length) {
		if (atLineStart && brackets === 0) {
			let w = 0
			while (src[i] === ' ' || src[i] === '\t' || src[i] === '\f') {
				w = src[i] === '\t' ? (Math.floor(w / TAB_WIDTH) + 1) * TAB_WIDTH : w + 1
				i += 1
			}
			// A blank or comment-only line carries no code and no block structure.
			if (src[i] === '\n' || src[i] === '#' || i >= src.length) {
				while (i < src.length && src[i] !== '\n') i += 1
				i += 1
				continue
			}
			width = w
			atLineStart = false
		}

		const char = src[i] ?? ''
		if (char === ' ' || char === '\t' || char === '\f') {
			i += 1
		} else if (char === '\n') {
			i += 1
			if (brackets === 0) {
				endLine()
				atLineStart = true
			}
		} else if (char === '\\' && src[i + 1] === '\n') {
			i += 2
		} else if (char === '#') {
			while (i < src.length && src[i] !== '\n') i += 1
		} else if (char === '"' || char === "'") {
			const end = stringEnd(src, i)
			tokens.push(src.slice(i, end))
			i = end
		} else if (isWordChar(char)) {
			let end = i
			while (end < src.length && isWordChar(src[end] ?? '')) end += 1
			const word = src.slice(i, end)
			const next = src[end]
			if ((next === '"' || next === "'") && STRING_PREFIXES.has(word.toLowerCase())) {
				const stringStop = stringEnd(src, end)
				tokens.push(src.slice(i, stringStop))
				i = stringStop
			} else {
				tokens.push(word)
				i = end
			}
		} else {
			if (OPENERS.includes(char)) brackets += 1
			else if (CLOSERS.includes(char)) brackets = Math.max(0, brackets - 1)
			tokens.push(char)
			i += 1
		}
	}
	endLine()
	return lines
}

// True when `source` has code and that code is not the starter's (modulo
// whitespace and comments). Empty and comment-only sources are never meaningful.
export function isMeaningfulChange(source: string, starter: string): boolean {
	const submitted = canonicalPython(source)
	if (submitted.length === 0) return false
	return JSON.stringify(submitted) !== JSON.stringify(canonicalPython(starter))
}
