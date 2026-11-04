// Semantic learning colors (semantic-tokens.css). These tests pin the contract:
// the tokens REUSE the existing syntax theme and brand colors instead of
// inventing hues, stay readable on both surfaces, and are applied only where
// the role comes from structured data.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const tokens = read('./semantic-tokens.css')
const practice = read('./practice.module.css')
const replay = read('./replay-view.tsx')
const tutorCss = read('./tutor/tutor.module.css')

function token(name: string): string {
	const m = tokens.match(new RegExp(`--tc-sem-${name}:\\s*(#[0-9a-fA-F]{6})`))
	assert.ok(m, `token ${name} is defined`)
	return m[1]!.toLowerCase()
}
function themeColor(cls: string): string {
	const m = practice.match(new RegExp(`\\.${cls}\\s*\\{\\s*color:\\s*(#[0-9a-fA-F]{6})`))
	assert.ok(m, `.${cls} has a color in the syntax theme`)
	return m[1]!.toLowerCase()
}
function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
	const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
	return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
}
function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi! + 0.05) / (lo! + 0.05)
}

describe('semantic learning colors', () => {
	it('dark-surface roles reuse the existing Python syntax theme and brand emerald', () => {
		assert.equal(token('loop-on-dark'), themeColor('kw'))
		assert.equal(token('variable-on-dark'), themeColor('fn'))
		assert.equal(token('literal-on-dark'), themeColor('num'))
		// Brand emerald used by the Tutor mark, send button and active states.
		assert.equal(token('goal-on-dark'), '#58d7a2')
		assert.match(tutorCss, /#58d7a2/)
	})

	it('every role has both a dark and a light variant', () => {
		for (const role of ['loop', 'variable', 'literal', 'goal']) {
			token(`${role}-on-dark`)
			token(`${role}-on-light`)
		}
	})

	it('meets 4.5:1 contrast on its own surface', () => {
		for (const role of ['loop', 'variable', 'literal', 'goal']) {
			assert.ok(contrast(token(`${role}-on-dark`), '#171d24') >= 4.5, `${role} on graphite`)
			assert.ok(contrast(token(`${role}-on-light`), '#edf2ed') >= 4.5, `${role} on light card`)
		}
	})

	it('is applied to replay surfaces whose role comes from trace data', () => {
		assert.match(practice, /\.traceLoopItem code[^}]*var\(--tc-sem-loop-on-light/)
		assert.match(practice, /\.localName\s*\{[^}]*var\(--tc-sem-variable-on-light/)
		assert.match(practice, /\.localValue\s*\{[^}]*var\(--tc-sem-literal-on-light/)
	})

	it('never relies on color alone: loop keeps its "for" text and a left rule', () => {
		assert.match(replay, /<code>for \{loop\.variable/)
		assert.match(practice, /\.traceLoopItem code[^}]*border-left:\s*3px solid/)
	})

	it('keeps the amber "changed" badge readable instead of layering hues on it', () => {
		assert.match(
			practice,
			/\.localChanged \.localName,\s*\.localChanged \.localValue\s*\{\s*color:\s*inherit/
		)
	})

	it('does not color Tracy prose, and does not touch the syntax theme itself', () => {
		const markdownView = read('./tutor/markdown-view.tsx')
		const conversation = read('./tutor/tutor-conversation.tsx')
		assert.doesNotMatch(markdownView, /tc-sem-/)
		assert.doesNotMatch(conversation, /tc-sem-/)
		assert.equal(themeColor('kw'), '#caa8ff')
		assert.equal(themeColor('fn'), '#83c9ff')
		assert.equal(themeColor('num'), '#ffbd80')
		assert.equal(themeColor('str'), '#a4d69b')
		assert.equal(themeColor('com'), '#8897a8')
	})

	it('topic chips are neutral and come from catalog data, not text matching', () => {
		assert.doesNotMatch(tutorCss.match(/\.topicChip\s*\{[^}]*\}/)![0], /tc-sem-/)
		const ws = read('./practice-workspace.tsx')
		assert.match(ws, /topics: problem\.conceptTags/)
	})
})
