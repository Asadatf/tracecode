import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isPythonFence, parseInline, parseMarkdown, type MdBlock } from './markdown'

describe('tutor markdown parser', () => {
	it('parses a plain paragraph', () => {
		const [b] = parseMarkdown('hello world')
		assert.equal(b?.kind, 'paragraph')
		assert.deepEqual((b as MdBlock & { kind: 'paragraph' }).inline, [
			{ kind: 'text', value: 'hello world' }
		])
	})

	it('parses headings at levels 1..3 only', () => {
		const blocks = parseMarkdown('# one\n## two\n### three\n#### still prose')
		assert.equal(blocks[0]?.kind, 'heading')
		assert.equal((blocks[0] as MdBlock & { kind: 'heading' }).level, 1)
		assert.equal((blocks[2] as MdBlock & { kind: 'heading' }).level, 3)
		// A `####` heading is intentionally NOT recognised — deeper noise
		// would be a styling hazard; it falls through to a paragraph.
		assert.equal(blocks[3]?.kind, 'paragraph')
	})

	it('parses bullet and numbered lists', () => {
		const bullets = parseMarkdown('- first\n- second')[0]
		assert.equal(bullets?.kind, 'list')
		assert.equal((bullets as MdBlock & { kind: 'list' }).ordered, false)
		assert.equal((bullets as MdBlock & { kind: 'list' }).items.length, 2)

		const numbered = parseMarkdown('1. first\n2. second')[0]
		assert.equal((numbered as MdBlock & { kind: 'list' }).ordered, true)
	})

	it('parses fenced code with and without a language tag', () => {
		const withLang = parseMarkdown('```python\nprint(1)\n```')
		assert.equal(withLang[0]?.kind, 'code')
		assert.equal((withLang[0] as MdBlock & { kind: 'code' }).language, 'python')
		assert.equal((withLang[0] as MdBlock & { kind: 'code' }).source, 'print(1)')

		const noLang = parseMarkdown('```\nraw\n```')
		assert.equal((noLang[0] as MdBlock & { kind: 'code' }).language, null)
	})

	it('preserves indentation and blank lines inside a code fence', () => {
		const md = '```python\ndef f():\n    if True:\n        return 1\n\n    return 0\n```'
		const b = parseMarkdown(md)[0] as MdBlock & { kind: 'code' }
		assert.equal(b.source, 'def f():\n    if True:\n        return 1\n\n    return 0')
	})

	it('recovers from an unterminated fence at EOF', () => {
		const b = parseMarkdown('```python\nprint(1)')[0]
		assert.equal(b?.kind, 'code')
		assert.equal((b as MdBlock & { kind: 'code' }).source, 'print(1)')
	})

	it('renders inline bold and inline code distinctly', () => {
		const parts = parseInline('run **the** `two_sum` function')
		assert.deepEqual(parts, [
			{ kind: 'text', value: 'run ' },
			{ kind: 'bold', value: 'the' },
			{ kind: 'text', value: ' ' },
			{ kind: 'code', value: 'two_sum' },
			{ kind: 'text', value: ' function' }
		])
	})

	it('does NOT treat underscores as bold (so __init__ stays prose)', () => {
		const parts = parseInline('see __init__ in Python')
		assert.deepEqual(parts, [{ kind: 'text', value: 'see __init__ in Python' }])
	})

	it('does not allow nested code inside code', () => {
		const parts = parseInline('`a**b**c`')
		assert.deepEqual(parts, [{ kind: 'code', value: 'a**b**c' }])
	})

	it('recognises python/py/python3 as the highlighter language', () => {
		assert.equal(isPythonFence('python'), true)
		assert.equal(isPythonFence('py'), true)
		assert.equal(isPythonFence('PYTHON3'), true)
		assert.equal(isPythonFence('plaintext'), false)
		assert.equal(isPythonFence(null), false)
	})

	it('escapeHtml neutralises every HTML-significant character', async () => {
		const { escapeHtml } = await import('./markdown')
		assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
		assert.equal(escapeHtml(`"it's" & stuff`), '&quot;it&#39;s&quot; &amp; stuff')
	})

	it('renderInlineHtml escapes text, bold, and inline code; emits no other tags', async () => {
		const { renderInlineHtml, parseInline } = await import('./markdown')
		const parts = parseInline('see `<img onerror=x>` and **<b>bold</b>** inline')
		const html = renderInlineHtml(parts)
		// No raw <img> tag survives — the angle brackets inside code are escaped.
		assert.doesNotMatch(html, /<img\b/)
		// `onerror` appears only as text content, never as an HTML attribute
		// attached to a tag.
		assert.doesNotMatch(html, /<\w+[^>]*\sonerror=/)
		// Only strong and code tags are emitted.
		const allowed = html.replace(/<\/?(strong|code)>/g, '')
		assert.doesNotMatch(allowed, /<[a-zA-Z]/, 'no stray HTML tags outside strong/code')
	})

	it('renderInlineHtml accepts an attribute-shaped string without emitting it ON A TAG', async () => {
		// A model reply containing what LOOKS like an HTML attribute must
		// not come through attached to a tag. Text preserves the literal
		// characters, but the quote mark is escaped so no attribute can
		// parse out of the surrounding markup.
		const { renderInlineHtml, parseInline } = await import('./markdown')
		const html = renderInlineHtml(parseInline('a **b** style="color:red"'))
		// No attribute on any emitted tag.
		assert.doesNotMatch(html, /<\w+[^>]*\sstyle=/)
		// The literal style= characters are preserved as text, with escaped quotes.
		assert.match(html, /style=&quot;color:red&quot;/)
	})

	it('does not synthesise HTML — strings pass through unchanged (no attrs, no tags)', () => {
		// The renderer escapes via React. But even at the parser layer, no
		// token should contain a stray `<` or `>` that it did not receive.
		// The fence opener must live on its own line (standard Markdown).
		const md = 'try <script>x</script> and here:\n```html\n<b>hi</b>\n```'
		const blocks = parseMarkdown(md)
		const p = blocks[0] as MdBlock & { kind: 'paragraph' }
		assert.equal(p.inline[0]?.kind, 'text')
		assert.ok((p.inline[0] as { value: string }).value.includes('<script>'))
		const c = blocks[1] as MdBlock & { kind: 'code' }
		assert.equal(c.kind, 'code')
		assert.equal(c.source, '<b>hi</b>')
	})
})
