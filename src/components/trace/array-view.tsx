'use client'

import { cn } from '@/lib/cn'
import { formatValue } from '@/lib/trace/value'
import type { Value } from '@/lib/trace/contract'
import styles from './practice.module.css'

export interface ArrayPointer {
	name: string
	index: number
	bg: string
	fg: string
}

function Badges({ pointers }: { pointers: ArrayPointer[] }) {
	return (
		<div className={styles.traceArrayPointer}>
			{pointers.map((p) => (
				<span
					key={p.name}
					className={styles.tracePointer}
					style={{ background: p.bg, color: p.fg }}
				>
					{p.name}
				</span>
			))}
		</div>
	)
}

// Indexed cells with pointer tabs above their actual positions. Overlapping
// pointers stack; out-of-range pointers are drawn past the end (never clamped).
export function ArrayView({ cells, pointers }: { cells: Value[]; pointers: ArrayPointer[] }) {
	const inRange = pointers.filter((p) => p.index >= 0 && p.index < cells.length)
	const offEnd = pointers
		.filter((p) => p.index >= cells.length || p.index < 0)
		.sort((a, b) => a.index - b.index)

	if (cells.length === 0 && offEnd.length === 0) {
		return <p className={styles.description}>Empty array.</p>
	}

	return (
		<div className={styles.array}>
			{cells.map((cell, index) => {
				const here = inRange.filter((p) => p.index === index)
				return (
					<div key={index} className={styles.arraycell}>
						<Badges pointers={here} />
						<div
							className={cn(
								styles.cellval,
								here.length > 0 && styles.cellPointed,
								here.length > 1 && styles.cellBoth
							)}
						>
							{formatValue(cell)}
						</div>
						<div className={styles.index}>index {index}</div>
					</div>
				)
			})}
			{offEnd.map((p) => (
				<div key={p.name} className={styles.arraycell}>
					<Badges pointers={[p]} />
					<div className={cn(styles.cellval, styles.offEnd)}>off end</div>
					<div className={styles.index}>index {p.index}</div>
				</div>
			))}
		</div>
	)
}
