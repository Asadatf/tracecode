'use client'

import { useEffect, useState } from 'react'
import { formatClock } from '@/lib/challenge/daily'
import styles from './preview.module.css'

// Countdown to the REAL fixed schedule (15:00–15:30 UTC), driven by the server's clock at page
// load and advanced by the browser for display only. The exam itself is not active in preview.
const DAY_MS = 86_400_000

export function ExamCountdown({
	serverNow,
	opensAt,
	closesAt
}: {
	serverNow: string
	opensAt: string
	closesAt: string
}) {
	const [offset] = useState(() => Date.parse(serverNow) - Date.now())
	const [now, setNow] = useState(() => Date.parse(serverNow))
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now() + offset), 1000)
		return () => window.clearInterval(id)
	}, [offset])
	const opens = Date.parse(opensAt)
	const closes = Date.parse(closesAt)
	const open = now >= opens && now < closes
	const target = now < opens ? opens : open ? closes : opens + DAY_MS
	const label = now < opens ? 'Opens in' : open ? 'Closes in' : "Tomorrow's exam opens in"
	return (
		<div className={styles.countdown} role="timer" aria-live="off">
			<span className={styles.clock}>{formatClock(Math.max(0, target - now))}</span>
			<span className={styles.clockLabel}>{label}</span>
		</div>
	)
}
