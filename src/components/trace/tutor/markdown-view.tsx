'use client'

import { useState, type ReactNode } from 'react'
import { parseMarkdown, isPythonFence, type MdBlock, type MdInline } from '@/lib/tutor/markdown'
import { highlight, tokenClasses } from '@/components/trace/code-editor'
import { CopyIcon } from '@/components/ui/icons'
import styles from './tutor.module.css'

// Renders assistant Markdown to React nodes. Prose, lists, bold and inline
// code go through JSX text interpolation, which React escapes — no
// innerHTML for anything a model wrote. The ONE place we use
// `dangerouslySetInnerHTML` is inside a Python code fence, and only after
// the source passes through `highlight()`, which escapes every `<`, `>`,
// `&`, `"` and `'` before wrapping tokens in `<span>` tags (see
// code-editor.tsx `escapeHtml`). That keeps requirement 9 (sanitize and
// prevent unsafe HTML, scripts, injected attributes) honest.

export function MarkdownView({ source }: { source: string }) {
	const blocks = parseMarkdown(source)
	return (
		<div className={styles.markdown}>
			{blocks.map((block, index) => (
				<Block key={index} block={block} />
			))}
		</div>
	)
}

function Block({ block }: { block: MdBlock }) {
	switch (block.kind) {
		case 'paragraph':
			return (
				<p>
					<Inline parts={block.inline} />
				</p>
			)
		case 'heading': {
			const children = <Inline parts={block.inline} />
			if (block.level === 1) return <h3 className={styles.mdHeading1}>{children}</h3>
			if (block.level === 2) return <h4 className={styles.mdHeading2}>{children}</h4>
			return <h5 className={styles.mdHeading3}>{children}</h5>
		}
		case 'list':
			return block.ordered ? (
				<ol className={styles.mdList}>
					{block.items.map((parts, i) => (
						<li key={i}>
							<Inline parts={parts} />
						</li>
					))}
				</ol>
			) : (
				<ul className={styles.mdList}>
					{block.items.map((parts, i) => (
						<li key={i}>
							<Inline parts={parts} />
						</li>
					))}
				</ul>
			)
		case 'code':
			return <CodeBlock language={block.language} source={block.source} />
	}
}

function Inline({ parts }: { parts: MdInline[] }): ReactNode {
	return (
		<>
			{parts.map((part, i) => {
				if (part.kind === 'text') return <span key={i}>{part.value}</span>
				if (part.kind === 'bold') return <strong key={i}>{part.value}</strong>
				return (
					<code key={i} className={styles.mdInlineCode}>
						{part.value}
					</code>
				)
			})}
		</>
	)
}

// Read-only, scrollable code block with a Copy button. We deliberately do
// not hand this to a code-editor dependency (requirement 11, 12): a <pre>
// with the project's own highlighter is enough, and swapping it later is
// a one-file change.
function CodeBlock({ language, source }: { language: string | null; source: string }) {
	const [copied, setCopied] = useState(false)
	const displayLang = language ?? 'text'
	const python = isPythonFence(language)

	async function copy() {
		try {
			await navigator.clipboard.writeText(source)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 1500)
		} catch {
			// Clipboard may be unavailable (insecure context, denied
			// permission). Fail quietly — the code is already visible and
			// selectable.
		}
	}

	return (
		<figure className={styles.mdCodeBlock} aria-label={`${displayLang} code block, read only`}>
			<div className={styles.mdCodeHead}>
				<span className={styles.mdCodeLang}>{displayLang}</span>
				<button
					type="button"
					className={styles.mdCodeCopy}
					onClick={copy}
					aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
				>
					<CopyIcon size={14} />
					<span>{copied ? 'Copied' : 'Copy'}</span>
				</button>
			</div>
			<pre
				className={styles.mdCodePre}
				tabIndex={0}
				role="region"
				aria-label={`${displayLang} code, read only`}
			>
				{python ? (
					<HighlightedPython source={source} />
				) : (
					<code className={styles.mdCodePlain}>{source}</code>
				)}
			</pre>
		</figure>
	)
}

function HighlightedPython({ source }: { source: string }) {
	// highlight() escapes before wrapping tokens; its return is a safe
	// HTML string. We join lines rather than render line-by-line so
	// horizontal scrolling behaves predictably on long lines (requirement
	// 4). Empty lines are preserved as `&nbsp;` by highlight() itself so
	// visual spacing survives.
	const html = source
		.split('\n')
		.map((line) => highlight(line, tokenClasses))
		.join('\n')
	return <code className={styles.mdCodePython} dangerouslySetInnerHTML={{ __html: html }} />
}
