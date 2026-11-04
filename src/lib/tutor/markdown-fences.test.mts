import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseMarkdown, splitInlineFence, type MdBlock } from './markdown'

type Code = Extract<MdBlock, { kind: 'code' }>
const codes = (md: string) => parseMarkdown(md).filter((b): b is Code => b.kind === 'code')
const kinds = (md: string) => parseMarkdown(md).map((b) => b.kind)

describe('valid fences are never altered', () => {
	it('keeps indentation, blank lines and content exactly', () => {
		const src = 'def f(x):\n    if x:\n        return "```"[0]\n\n    return None'
		// A string literal that merely contains backticks is not a closing fence line.
		const [c] = codes('```python\n' + src.replace('"```"[0]', '1') + '\n```')
		assert.equal(c?.source, src.replace('"```"[0]', '1'))
		assert.equal(c?.language, 'python')
	})

	it('does not touch HTML or markdown-looking text inside a block', () => {
		const [c] = codes('```text\n<b>**x**</b> `y`\n```')
		assert.equal(c?.source, '<b>**x**</b> `y`')
	})

	it('a fence directly after a sentence still starts a block', () => {
		assert.deepEqual(kinds('Example:\n```python\nx = 1\n```'), ['paragraph', 'code'])
	})
})

describe('indented fences (inside lists)', () => {
	it('strips only the fence indentation and keeps relative indentation', () => {
		const md = 'Example:\n   ```python\n   def f():\n       return 1\n   ```'
		const [c] = codes(md)
		assert.equal(c?.source, 'def f():\n    return 1')
		assert.equal(c?.language, 'python')
	})
})

describe('malformed inline fences', () => {
	it('opens and closes on one line, with a known language', () => {
		const [c] = codes('```python array = [10, 20, 30] print(array[1]) # Output: 20```')
		assert.equal(c?.language, 'python')
		assert.equal(c?.source, 'array = [10, 20, 30] print(array[1]) # Output: 20')
	})

	it('without a language the code is kept whole', () => {
		const [c] = codes('```numbers = [1, 2]```')
		assert.equal(c?.language, null)
		assert.equal(c?.source, 'numbers = [1, 2]')
	})

	it('never misreads the first code word as a language', () => {
		const [c] = codes('```array = 5```')
		assert.equal(c?.language, null)
		assert.equal(c?.source, 'array = 5')
	})

	it('keeps words around the fence as paragraphs', () => {
		assert.deepEqual(kinds('Try ```python x = 1``` now'), ['paragraph', 'code', 'paragraph'])
	})

	it('opening line carrying code, closed on a later line', () => {
		const [c] = codes('```python def f():\n    return 1\n```')
		assert.equal(c?.source, 'def f():\n    return 1')
		assert.equal(c?.language, 'python')
	})

	it('a closing fence glued to the last code line', () => {
		const [c] = codes('```python\nprint(x)```')
		assert.equal(c?.source, 'print(x)')
	})

	it('leaves ambiguous lines alone: several pairs, an empty pair, a lone language', () => {
		for (const line of ['a ```b``` c ```d```', '``` ```', '```python```']) {
			assert.equal(splitInlineFence(line), null, line)
			assert.equal(codes(line).length, 0, line)
		}
	})
})

describe('partially streamed fences', () => {
	const full =
		'Here is a loop:\n\n```python\nfor i in range(3):\n    print(i)\n```\n\nThat prints 0, 1, 2.'
	const finalSource = 'for i in range(3):\n    print(i)'

	it('every prefix of a streaming reply parses without throwing', () => {
		for (let n = 0; n <= full.length; n += 1) {
			assert.doesNotThrow(() => parseMarkdown(full.slice(0, n)), `prefix ${n}`)
		}
	})

	it('code grows monotonically and never leaks backticks into prose once inside the fence', () => {
		const open = full.indexOf('```python\n') + '```python\n'.length
		for (let n = open; n <= full.length; n += 1) {
			const blocks = parseMarkdown(full.slice(0, n))
			const c = blocks.find((b): b is Code => b.kind === 'code')
			assert.ok(c, `a code block exists at prefix ${n}`)
			// Ignore a half-typed closing fence (up to two backticks) at the tail.
			const shown = c.source.replace(/\n?`{1,2}$/, '')
			assert.ok(finalSource.startsWith(shown), `prefix ${n}: ${JSON.stringify(c.source)}`)
			for (const b of blocks) {
				if (b.kind === 'paragraph') {
					const text = b.inline.map((p) => p.value).join('')
					assert.ok(!text.includes('```'), `prose leaked a fence at prefix ${n}`)
				}
			}
		}
	})

	it('the finished reply is exactly paragraph, code, paragraph', () => {
		assert.deepEqual(kinds(full), ['paragraph', 'code', 'paragraph'])
		assert.equal(codes(full)[0]?.source, finalSource)
	})

	it('an unterminated inline-style opener streams as code to the end of the text', () => {
		const [c] = codes('```python array = [1, 2')
		assert.equal(c?.source, 'array = [1, 2')
	})
})
