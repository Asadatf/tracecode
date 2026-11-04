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

		// Fenced code: ```[lang]\n ... \n```
		const fenceMatch = line.match(/^```\s*([A-Za-z0-9+_-]*)\s*$/)
		if (fenceMatch != null) {
			const language = fenceMatch[1] === '' ? null : (fenceMatch[1] ?? null)
			const body: string[] = []
			i += 1
			while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
				body.push(lines[i] ?? '')
				i += 1
			}
			// Skip the closing fence (or fall through gracefully on EOF).
			if (i < lines.length) i += 1
			blocks.push({ kind: 'code', language, source: body.join('\n') })
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
			if (/^```/.test(cur)) break
			if (/^#{1,3}\s+/.test(cur)) break
			if (/^(\s*)([-*]|\d+\.)\s+/.test(cur)) break
			paraLines.push(cur)
			i += 1
		}
		blocks.push({ kind: 'paragraph', inline: parseInline(paraLines.join(' ')) })
	}

	return blocks
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
