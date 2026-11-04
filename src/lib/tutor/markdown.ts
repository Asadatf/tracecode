// A small, deliberate Markdown parser for AI Tutor replies. Covers only
// what the Tutor actually produces: paragraphs, ATX headings (# .. ###),
// bullet and numbered lists, **bold**, `inline code`, and fenced code
// blocks with an optional language tag.
//
// Why not pull in react-markdown or marked? Two reasons:
//   1. The surface here is tiny and well-defined — a typed AST + a dozen
//      lines of parsing is smaller than a dependency's README.
//   2. The output is rendered through React's JSX (not innerHTML) so
//      strings never carry HTML through the renderer, which rules out the
//      injection class of bug this spec calls out (requirement 9).
//
// Pure, framework-free, unit-testable under `node --test`.

export type MdInline =
	| { kind: 'text'; value: string }
	| { kind: 'bold'; value: string }
	| { kind: 'code'; value: string }

export type MdBlock =
	| { kind: 'paragraph'; inline: MdInline[] }
	| { kind: 'heading'; level: 1 | 2 | 3; inline: MdInline[] }
	| { kind: 'list'; ordered: boolean; items: MdInline[][] }
	| { kind: 'code'; language: string | null; source: string }

export function parseMarkdown(input: string): MdBlock[] {
	// Normalise CR/LF, strip a trailing newline for a cleaner trailing paragraph.
	const lines = input.replace(/\r\n?/g, '\n').split('\n')
	const blocks: MdBlock[] = []
	let i = 0

	while (i < lines.length) {
		const line = lines[i] ?? ''

		// Malformed single-line fence: ```python x = 1``` (open and close on one
		// line). Rendered as a code block when it is unambiguous (see
		// splitInlineFence); surrounding words become ordinary paragraphs.
		const inline = splitInlineFence(line)
		if (inline != null) {
			if (inline.before !== '') {
				blocks.push({ kind: 'paragraph', inline: parseInline(inline.before) })
			}
			blocks.push({ kind: 'code', language: inline.language, source: inline.source })
			if (inline.after !== '') {
				blocks.push({ kind: 'paragraph', inline: parseInline(inline.after) })
			}
			i += 1
			continue
		}

		// Fenced code. Canonical form: the opening fence on its own line (with an
		// optional language), code on the next lines, the closing fence on its own
		// line. Also tolerated, because models emit them while streaming and in
		// lists: an indented fence, and a known language followed by code on the
		// opening line (```python x = 1). An unterminated fence (a stream still in
		// flight) runs to the end of the text.
		const open = matchOpeningFence(line)
		if (open != null) {
			const body: string[] = open.firstLine != null ? [open.firstLine] : []
			let closed = false
			i += 1
			while (i < lines.length) {
				const cur = lines[i] ?? ''
				if (/^\s*```\s*$/.test(cur)) {
					i += 1
					closed = true
					break
				}
				// A closing fence glued to the last line of code: `print(x)```.
				const glued = cur.match(/^(.*\S)\s*```\s*$/)
				if (glued != null && !cur.includes('```', cur.indexOf('```') + 3)) {
					body.push(removeIndent(glued[1] ?? '', open.indent))
					i += 1
					closed = true
					break
				}
				body.push(removeIndent(cur, open.indent))
				i += 1
			}
			// A stream paused right after a newline leaves one empty trailing line in
			// an UNTERMINATED block; drop it so the code does not flicker taller.
			// Closed blocks are never trimmed: their content is exactly as written.
			if (!closed && body.length > 0 && body[body.length - 1] === '') body.pop()
			blocks.push({ kind: 'code', language: open.language, source: body.join('\n') })
			continue
		}

		// Blank lines separate blocks.
		if (line.trim() === '') {
			i += 1
			continue
		}

		// Headings — ATX, levels 1..3 only (deeper reads as plain paragraph
		// so an accidental `####` in prose doesn't blow up typography).
		const headingMatch = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/)
		if (headingMatch != null) {
			const level = headingMatch[1]!.length as 1 | 2 | 3
			blocks.push({ kind: 'heading', level, inline: parseInline(headingMatch[2] ?? '') })
			i += 1
			continue
		}

		// Lists — contiguous `- ` / `* ` / `N. ` lines.
		if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
			const ordered = /^\s*\d+\./.test(line)
			const items: MdInline[][] = []
			while (i < lines.length) {
				const cur = lines[i] ?? ''
				const m = cur.match(/^(\s*)(?:[-*]|\d+\.)\s+(.*)$/)
				if (m == null) break
				items.push(parseInline(m[2] ?? ''))
				i += 1
			}
			blocks.push({ kind: 'list', ordered, items })
			continue
		}

		// Paragraph — consume contiguous non-empty, non-block-start lines.
		const paraLines: string[] = [line]
		i += 1
		while (i < lines.length) {
			const cur = lines[i] ?? ''
			if (cur.trim() === '') break
			if (/^\s*```/.test(cur)) break
			if (/^#{1,3}\s+/.test(cur)) break
			if (/^(\s*)([-*]|\d+\.)\s+/.test(cur)) break
			paraLines.push(cur)
			i += 1
		}
		blocks.push({ kind: 'paragraph', inline: parseInline(paraLines.join(' ')) })
	}

	return blocks
}

// ── Fence helpers ────────────────────────────────────────────────────────
// Languages Tracy is likely to name. A first word is only read as a language
// when it is in this set, so "```array = 5```" is never misread as language
// "array".
const KNOWN_LANGUAGES = new Set([
	'python',
	'py',
	'python3',
	'text',
	'txt',
	'plaintext',
	'bash',
	'sh',
	'shell',
	'json',
	'javascript',
	'js',
	'typescript',
	'ts',
	'sql'
])

function removeIndent(line: string, indent: number): string {
	// Strip at most the opening fence's own indentation, never more, so code
	// that is indented relative to the fence keeps its shape.
	let n = 0
	while (n < indent && n < line.length && line[n] === ' ') n += 1
	return line.slice(n)
}

// The opening line of a fenced block, or null. Accepts the canonical
// "```", "```python", their indented forms, and "```python <code>".
function matchOpeningFence(
	line: string
): { language: string | null; indent: number; firstLine: string | null } | null {
	const plain = line.match(/^(\s*)```\s*([A-Za-z0-9+_-]*)\s*$/)
	if (plain != null) {
		const lang = plain[2] ?? ''
		return {
			language: lang === '' ? null : lang,
			indent: (plain[1] ?? '').length,
			firstLine: null
		}
	}
	const withCode = line.match(/^(\s*)```([A-Za-z0-9+_-]+)[ \t]+(\S.*)$/)
	if (withCode != null && KNOWN_LANGUAGES.has((withCode[2] ?? '').toLowerCase())) {
		// A second fence on this line is the single-line form, handled earlier.
		if (!(withCode[3] ?? '').includes('```')) {
			return {
				language: withCode[2] ?? null,
				indent: (withCode[1] ?? '').length,
				firstLine: withCode[3] ?? ''
			}
		}
	}
	return null
}

// A line holding exactly one fence pair: text? ```[lang] code``` text?
// Ambiguous lines (three or more fences, an empty pair, or a bare language
// word) return null and are left as ordinary text.
export function splitInlineFence(
	line: string
): { before: string; language: string | null; source: string; after: string } | null {
	const start = line.indexOf('```')
	if (start < 0) return null
	const end = line.indexOf('```', start + 3)
	if (end < 0 || line.indexOf('```', end + 3) >= 0) return null
	const inner = line.slice(start + 3, end)
	if (inner.trim() === '') return null
	const m = inner.match(/^([A-Za-z0-9+_-]+)[ \t]+([\s\S]*\S)\s*$/)
	const hasLanguage = m != null && KNOWN_LANGUAGES.has((m[1] ?? '').toLowerCase())
	// A lone known language word ("```python```") carries no code.
	if (!hasLanguage && KNOWN_LANGUAGES.has(inner.trim().toLowerCase())) return null
	return {
		before: line.slice(0, start).trim(),
		language: hasLanguage ? (m?.[1] ?? null) : null,
		source: hasLanguage ? (m?.[2] ?? '') : inner.trim(),
		after: line.slice(end + 3).trim()
	}
}

// Inline grammar, applied greedily left-to-right:
//   `code` wins over everything (no nesting inside code).
//   **bold** (asterisks only — underscores in Python identifiers are
//           common, and `__init__` as bold would be wrong).
//   Everything else is text.
export function parseInline(input: string): MdInline[] {
	const out: MdInline[] = []
	const re = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)/g
	let last = 0
	let match: RegExpExecArray | null
	while ((match = re.exec(input)) != null) {
		if (match.index > last) {
			out.push({ kind: 'text', value: input.slice(last, match.index) })
		}
		const token = match[0]
		if (token.startsWith('`')) {
			out.push({ kind: 'code', value: token.slice(1, -1) })
		} else {
			out.push({ kind: 'bold', value: token.slice(2, -2) })
		}
		last = re.lastIndex
	}
	if (last < input.length) {
		out.push({ kind: 'text', value: input.slice(last) })
	}
	return out
}

// Narrow helper for the code-block highlighter: 'python' is the one
// language the Tutor should produce, and the one the project already has
// a highlighter for. Everything else renders as plain, preformatted text.
export function isPythonFence(lang: string | null): boolean {
	if (lang == null) return false
	const l = lang.toLowerCase()
	return l === 'python' || l === 'py' || l === 'python3'
}

// ── Safe HTML helpers ────────────────────────────────────────────────────
//
// The React component in markdown-view.tsx renders prose through JSX, which
// escapes by default. These helpers are the deterministic, dependency-free
// proof of the same invariant — unit tests can assert "no raw < or > ever
// reaches the output" without booting a DOM.

export function escapeHtml(value: string): string {
	let out = ''
	for (const ch of value) {
		if (ch === '&') out += '&amp;'
		else if (ch === '<') out += '&lt;'
		else if (ch === '>') out += '&gt;'
		else if (ch === '"') out += '&quot;'
		else if (ch === "'") out += '&#39;'
		else out += ch
	}
	return out
}

// Returns an HTML string for one inline block. Emits exactly `<strong>`,
// `<code>` and text nodes — no `<a>`, `<img>`, no event handlers, no style
// attributes, so an injection through learner-visible text cannot
// synthesise HTML it did not already have the raw characters for (which
// `escapeHtml` then neutralises).
export function renderInlineHtml(parts: MdInline[]): string {
	let out = ''
	for (const part of parts) {
		if (part.kind === 'text') out += escapeHtml(part.value)
		else if (part.kind === 'bold') out += `<strong>${escapeHtml(part.value)}</strong>`
		else out += `<code>${escapeHtml(part.value)}</code>`
	}
	return out
}
