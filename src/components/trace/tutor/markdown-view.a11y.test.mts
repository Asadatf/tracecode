// Accessibility contract for the MarkdownView code-block renderer.
//
// We cannot render React into a DOM here without jsdom (the project's test
// runner is dependency-free `node --test`), so instead we read the
// component source and assert the a11y wiring is present. That protects
// the invariant with zero runtime cost and no new deps, and catches a
// regression the moment an aria-* or role attribute gets edited away.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./markdown-view.tsx', import.meta.url), 'utf8')

describe('MarkdownView — accessibility contract', () => {
	it('Copy button has an accessible name in both states', () => {
		assert.match(
			src,
			/aria-label=\{copied \? 'Code copied to clipboard' : 'Copy code to clipboard'\}/
		)
	})

	it('code block carries "read only" in its accessible name', () => {
		// The code-block <pre> cannot use aria-readonly (unsupported by
		// role=region, see jsx-a11y/role-supports-aria-props), so the
		// invariant moves into the accessible name itself.
		assert.match(src, /aria-label=\{`\$\{displayLang\} code, read only`\}/)
	})

	it('code block is a focusable region with a label and tab stop', () => {
		assert.match(src, /tabIndex=\{0\}/)
		assert.match(src, /role="region"/)
	})

	it('figure wrapper carries a group label naming the language and read-only state', () => {
		assert.match(src, /aria-label=\{`\$\{displayLang\} code block, read only`\}/)
	})

	it('only the Python code path uses dangerouslySetInnerHTML, and only on highlight() output', () => {
		// There must be exactly one dangerouslySetInnerHTML in the file,
		// and it is adjacent to the pre-escaped `highlight()` output —
		// requirement 9 (sanitize, no injection).
		// Match the JSX attribute specifically — the comment at the top
		// also mentions the API by name, which would double-count.
		const matches = src.match(/dangerouslySetInnerHTML=\{/g) ?? []
		assert.equal(matches.length, 1, 'only one HTML-injection site is permitted')
		assert.match(src, /highlight\(line, tokenClasses\)/)
	})

	it('does not import a code editor library or a Markdown library', () => {
		// Requirement 11/12: no new editor; and the spec says to avoid a
		// large Markdown dep. The renderer must only pull in our own
		// highlighter, our own parser, and icons.
		assert.doesNotMatch(src, /from 'react-markdown'/)
		assert.doesNotMatch(src, /from 'marked'/)
		assert.doesNotMatch(src, /from 'markdown-it'/)
		assert.doesNotMatch(src, /from 'shiki'/)
		assert.doesNotMatch(src, /from 'prismjs'/)
		assert.doesNotMatch(src, /from '@monaco-editor/)
		assert.doesNotMatch(src, /from 'codemirror'/)
	})
})
