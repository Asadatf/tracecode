'use client'

import { useRef, type KeyboardEvent, type UIEvent } from 'react'
import styles from './practice.module.css'

// Dark Python editor matching the prototype: a transparent <textarea> over a
// syntax-highlighted overlay with a line-number gutter. No editor dependency —
// Asad can swap the presentation without touching the engine.

export interface TokenClasses {
	kw: string
	fn: string
	num: string
	str: string
	com: string
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (c) => {
		if (c === '&') return '&amp;'
		if (c === '<') return '&lt;'
		if (c === '>') return '&gt;'
		if (c === '"') return '&quot;'
		return '&#39;'
	})
}

const KEYWORDS =
	/^(def|for|in|if|return|else|elif|while|not|and|or|True|False|None|break|continue|pass|class|import|from|with|as|lambda|try|except|finally|raise|yield|global|nonlocal|assert|del|is)$/
const BUILTINS =
	/^(range|len|enumerate|print|int|str|list|dict|set|tuple|sorted|sum|min|max|abs|zip|map|filter|bool|float)$/

// Token-level highlight → HTML. Deliberately simple; not a full parser.
export function highlight(line: string, cls: TokenClasses): string {
	const pattern = /(#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[A-Za-z_]\w*\b|\b\d+\b)/g
	let out = ''
	let pos = 0
	let match: RegExpExecArray | null
	while ((match = pattern.exec(line)) != null) {
		out += escapeHtml(line.slice(pos, match.index))
		const token = match[0]
		let klass = ''
		if (token.startsWith('#')) klass = cls.com
		else if (/^['"]/.test(token)) klass = cls.str
		else if (/^\d/.test(token)) klass = cls.num
		else if (KEYWORDS.test(token)) klass = cls.kw
		else if (BUILTINS.test(token)) klass = cls.fn
		out += klass === '' ? escapeHtml(token) : `<span class="${klass}">${escapeHtml(token)}</span>`
		pos = pattern.lastIndex
	}
	out += escapeHtml(line.slice(pos))
	return out === '' ? '&nbsp;' : out
}

export const tokenClasses: TokenClasses = {
	kw: styles.kw ?? '',
	fn: styles.fn ?? '',
	num: styles.num ?? '',
	str: styles.str ?? '',
	com: styles.com ?? ''
}

export function CodeEditor({
	value,
	onChange,
	readOnly = false,
	ariaLabel = 'Python code editor'
}: {
	value: string
	onChange?: (next: string) => void
	readOnly?: boolean
	ariaLabel?: string
}) {
	const overlayRef = useRef<HTMLDivElement>(null)
	const lines = value.split('\n')

	function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
		const overlay = overlayRef.current
		if (overlay == null) return
		overlay.scrollTop = event.currentTarget.scrollTop
		overlay.scrollLeft = event.currentTarget.scrollLeft
	}

	function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (readOnly || onChange == null) return
		const textarea = event.currentTarget
		if (event.key === 'Tab') {
			event.preventDefault()
			const start = textarea.selectionStart
			const end = textarea.selectionEnd
			onChange(value.slice(0, start) + '    ' + value.slice(end))
			requestAnimationFrame(() => textarea.setSelectionRange(start + 4, start + 4))
		}
		if (event.key === 'Enter') {
			event.preventDefault()
			const start = textarea.selectionStart
			const lineStart = value.lastIndexOf('\n', start - 1) + 1
			const before = value.slice(lineStart, start)
			const indentMatch = before.match(/^[ \t]*/)
			const indent = indentMatch != null ? indentMatch[0] : ''
			const addBlock = /:\s*(?:#.*)?$/.test(before) && !before.trimStart().startsWith('#')
			const insert = '\n' + indent + (addBlock ? '    ' : '')
			onChange(value.slice(0, start) + insert + value.slice(textarea.selectionEnd))
			const caret = start + insert.length
			requestAnimationFrame(() => textarea.setSelectionRange(caret, caret))
		}
	}

	return (
		<div className={styles.editorWrap}>
			<div ref={overlayRef} aria-hidden="true" className={styles.codeview}>
				{lines.map((line, i) => (
					<div key={i} className={styles.line}>
						<span className={styles.ln}>{i + 1}</span>
						<span
							className={styles.source}
							dangerouslySetInnerHTML={{ __html: highlight(line, tokenClasses) }}
						/>
					</div>
				))}
			</div>
			<textarea
				aria-label={ariaLabel}
				spellCheck={false}
				autoCapitalize="off"
				autoComplete="off"
				autoCorrect="off"
				readOnly={readOnly}
				value={value}
				onChange={(e) => onChange?.(e.target.value)}
				onKeyDown={onKeyDown}
				onScroll={syncScroll}
				className={styles.editor}
			/>
		</div>
	)
}
