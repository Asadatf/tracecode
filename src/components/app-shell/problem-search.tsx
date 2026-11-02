'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { useRouter } from '@/i18n/routing'
import { SearchIcon } from '@/components/ui/icons'
import { filterProblems, type SearchableProblem } from '@/lib/search/filter-problems'
import styles from './app-shell.module.css'

export interface SearchLabels {
	label: string
	placeholder: string
	empty: string
}

// The top bar's problem search (specs/features/dashboard-page.md AC10): an ARIA
// combobox over the slim catalogue the server passes in. Filtering is local —
// no request, nothing typed is stored or tracked.
export function ProblemSearch({
	problems,
	labels
}: {
	problems: SearchableProblem[]
	labels: SearchLabels
}) {
	const router = useRouter()
	const listId = useId()
	const [query, setQuery] = useState('')
	const [open, setOpen] = useState(false)
	const [active, setActive] = useState(0)
	const results = filterProblems(problems, query)
	const showPanel = open && query.trim() !== ''
	const activeResult = results[active]

	function go(slug: string) {
		setOpen(false)
		setQuery('')
		router.push(`/practice/${slug}`)
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === 'ArrowDown' && results.length > 0) {
			event.preventDefault()
			setOpen(true)
			setActive((index) => (index + 1) % results.length)
		} else if (event.key === 'ArrowUp' && results.length > 0) {
			event.preventDefault()
			setActive((index) => (index - 1 + results.length) % results.length)
		} else if (event.key === 'Enter' && showPanel && activeResult != null) {
			event.preventDefault()
			go(activeResult.slug)
		} else if (event.key === 'Escape') {
			if (open || query !== '') event.preventDefault()
			setOpen(false)
			setQuery('')
		}
	}

	return (
		<div
			className={styles.search}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
			}}
		>
			<SearchIcon size={18} className={styles.searchIcon} />
			<input
				type="search"
				role="combobox"
				aria-label={labels.label}
				aria-expanded={showPanel}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={
					showPanel && activeResult != null ? `${listId}-${active}` : undefined
				}
				autoComplete="off"
				placeholder={labels.placeholder}
				className={styles.searchInput}
				value={query}
				onChange={(event) => {
					setQuery(event.target.value)
					setActive(0)
					setOpen(true)
				}}
				onFocus={() => setOpen(true)}
				onKeyDown={onKeyDown}
			/>
			{showPanel ? (
				<ul id={listId} role="listbox" aria-label={labels.label} className={styles.searchPanel}>
					{results.length === 0 ? (
						<li role="presentation" className={styles.searchEmpty}>
							{labels.empty}
						</li>
					) : (
						results.map((problem, index) => (
							<li
								key={problem.slug}
								id={`${listId}-${index}`}
								role="option"
								aria-selected={index === active}
								className={styles.searchOption}
								// Keep focus in the input so the blur handler doesn't close the panel first.
								onMouseDown={(event) => event.preventDefault()}
								onMouseEnter={() => setActive(index)}
								onClick={() => go(problem.slug)}
							>
								<span className={styles.searchTitle}>{problem.title}</span>
								<span className={styles.searchTopics}>{problem.topics}</span>
							</li>
						))
					)}
				</ul>
			) : null}
		</div>
	)
}
