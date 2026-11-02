'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { BellIcon, SpinnerIcon } from '@/components/ui/icons'
import type { NotificationView } from '@/lib/notifications/queries'
import {
	listNotificationsAction,
	markAllNotificationsReadAction,
	markNotificationReadAction
} from '@/server/actions/notifications'

// The in-app notification bell (M7.5B). The header renders it only for a
// signed-in learner, with the unread count from the server; the list itself is
// fetched when the panel opens, so a page load costs one indexed COUNT, not a
// list query. Reading never creates a notification — only the daily scheduler
// does. Every action is scoped to the session learner on the server.

export interface BellLabels {
	open: string
	unread: string
	heading: string
	markAll: string
	markRead: string
	empty: string
	error: string
	loading: string
}

type Panel =
	| { state: 'closed' }
	| { state: 'loading' }
	| { state: 'error' }
	| { state: 'ready'; items: NotificationView[] }

export function NotificationBell({
	initialUnread,
	labels
}: {
	initialUnread: number | null
	labels: BellLabels
}) {
	const [unread, setUnread] = useState(initialUnread)
	const [panel, setPanel] = useState<Panel>({ state: 'closed' })
	const [pending, startTransition] = useTransition()
	const rootRef = useRef<HTMLDivElement>(null)
	const open = panel.state !== 'closed'

	// Close on Escape or a click outside the panel.
	useEffect(() => {
		if (!open) return
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') setPanel({ state: 'closed' })
		}
		function onPointer(event: PointerEvent) {
			if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
				setPanel({ state: 'closed' })
			}
		}
		document.addEventListener('keydown', onKey)
		document.addEventListener('pointerdown', onPointer)
		return () => {
			document.removeEventListener('keydown', onKey)
			document.removeEventListener('pointerdown', onPointer)
		}
	}, [open])

	function load() {
		setPanel({ state: 'loading' })
		startTransition(async () => {
			const result = await listNotificationsAction(undefined)
			if (!result.ok || !result.data.available) {
				setPanel({ state: 'error' })
				return
			}
			setUnread(result.data.unreadCount)
			setPanel({ state: 'ready', items: result.data.items })
		})
	}

	function toggle() {
		if (open) setPanel({ state: 'closed' })
		else load()
	}

	function markOne(id: string) {
		setPanel((current) =>
			current.state === 'ready'
				? {
						state: 'ready',
						items: current.items.map((item) => (item.id === id ? { ...item, read: true } : item))
					}
				: current
		)
		setUnread((count) => (count == null ? count : Math.max(0, count - 1)))
		startTransition(async () => {
			await markNotificationReadAction({ id })
		})
	}

	function markAll() {
		setPanel((current) =>
			current.state === 'ready'
				? { state: 'ready', items: current.items.map((item) => ({ ...item, read: true })) }
				: current
		)
		setUnread(0)
		startTransition(async () => {
			await markAllNotificationsReadAction(undefined)
		})
	}

	const hasUnread = unread != null && unread > 0
	const items = panel.state === 'ready' ? panel.items : []

	return (
		<div ref={rootRef} className="relative ml-auto">
			<button
				type="button"
				onClick={toggle}
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-label={hasUnread ? `${labels.open} (${unread} ${labels.unread})` : labels.open}
				className="text-text-muted hover:text-text hover:bg-surface-hover relative grid size-9 place-items-center rounded-sm"
			>
				<BellIcon className="size-5" />
				{hasUnread ? (
					<span
						aria-hidden="true"
						className="bg-accent text-accent-ink absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold"
					>
						{unread > 9 ? '9+' : unread}
					</span>
				) : null}
			</button>

			{open ? (
				<div
					role="dialog"
					aria-label={labels.heading}
					className="border-border bg-surface absolute right-0 z-20 mt-2 flex w-[min(22rem,calc(100vw-2rem))] flex-col rounded-sm border shadow-lg"
				>
					<div className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5">
						<span className="text-sm font-semibold">{labels.heading}</span>
						{items.some((item) => !item.read) ? (
							<button
								type="button"
								onClick={markAll}
								disabled={pending}
								className="text-accent hover:text-accent-hover text-xs font-semibold"
							>
								{labels.markAll}
							</button>
						) : null}
					</div>

					{panel.state === 'loading' ? (
						<p
							className="text-text-muted m-0 flex items-center gap-2 px-4 py-6 text-sm"
							role="status"
						>
							<SpinnerIcon className="size-4" />
							{labels.loading}
						</p>
					) : panel.state === 'error' ? (
						<p className="text-warning m-0 px-4 py-6 text-sm" role="status">
							{labels.error}
						</p>
					) : items.length === 0 ? (
						<p className="text-text-muted m-0 px-4 py-6 text-sm">{labels.empty}</p>
					) : (
						<ul className="m-0 max-h-96 list-none overflow-y-auto p-0">
							{items.map((item) => (
								<li key={item.id} className="border-border border-b last:border-b-0">
									<div
										className={cn(
											'flex flex-col gap-1 px-4 py-3',
											!item.read && 'bg-surface-subtle'
										)}
									>
										<div className="flex items-start justify-between gap-2">
											<span className={cn('text-sm', item.read ? 'font-medium' : 'font-semibold')}>
												{item.title}
											</span>
											{!item.read ? (
												<button
													type="button"
													onClick={() => markOne(item.id)}
													className="text-text-muted hover:text-text shrink-0 text-xs"
												>
													{labels.markRead}
												</button>
											) : null}
										</div>
										<p className="text-text-muted m-0 text-sm leading-relaxed">{item.body}</p>
										{item.concept ? (
											<p className="text-text-muted m-0 text-xs">{item.concept}</p>
										) : null}
										<Link
											href={item.href}
											onClick={() => {
												if (!item.read) markOne(item.id)
												setPanel({ state: 'closed' })
											}}
											className="text-accent hover:text-accent-hover text-sm font-semibold"
										>
											{item.cta}
										</Link>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			) : null}
		</div>
	)
}
