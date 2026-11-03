'use client'

import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import styles from './workspace.module.css'

export interface TabItem {
	id: string
	label: string
	// A small dot: something new is waiting in this tab.
	dot?: boolean
}

export function tabId(prefix: string, id: string): string {
	return `${prefix}-tab-${id}`
}
export function panelId(prefix: string, id: string): string {
	return `${prefix}-panel-${id}`
}

// The standard tabs pattern (practice-workspace-layout AC12): arrow keys move,
// Home and End jump, and only the selected tab is in the tab order. Panels are
// rendered by the parent with role="tabpanel" and these ids.
export function TabList({
	prefix,
	label,
	tabs,
	active,
	onChange,
	id
}: {
	prefix: string
	label: string
	tabs: readonly TabItem[]
	active: string
	onChange: (id: string) => void
	id?: string
}) {
	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		const index = tabs.findIndex((tab) => tab.id === active)
		let next = -1
		if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
		else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
		else if (event.key === 'Home') next = 0
		else if (event.key === 'End') next = tabs.length - 1
		const target = tabs[next]
		if (target == null) return
		event.preventDefault()
		onChange(target.id)
		document.getElementById(tabId(prefix, target.id))?.focus()
	}

	return (
		<div id={id} role="tablist" aria-label={label} className={styles.tabs} onKeyDown={onKeyDown}>
			{tabs.map((tab) => {
				const selected = tab.id === active
				return (
					<button
						key={tab.id}
						id={tabId(prefix, tab.id)}
						type="button"
						role="tab"
						aria-selected={selected}
						aria-controls={panelId(prefix, tab.id)}
						tabIndex={selected ? 0 : -1}
						className={cn(styles.tab, selected && styles.tabActive)}
						onClick={() => onChange(tab.id)}
					>
						{tab.label}
						{tab.dot === true && !selected ? (
							<span className={styles.tabDot} aria-hidden="true" />
						) : null}
					</button>
				)
			})}
		</div>
	)
}
