'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { BellIcon, CodeIcon, ExternalLinkIcon, SlidersIcon } from '@/components/ui/icons'
import { DEMO_NOTIFICATIONS, DEMO_NOTIFICATIONS_ENABLED } from '@/lib/notifications/demo'
import { relativeTime } from '@/lib/notifications/relative-time'
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
	subheading: string
	newCount: string
	all: string
	unreadTab: string
	emptyUnread: string
	settings: string
}

type Filter = 'all' | 'unread'

type Panel =
	| { state: 'closed' }
	| { state: 'loading' }
	| { state: 'error' }
	| { state: 'ready'; items: NotificationView[] }

const demo = DEMO_NOTIFICATIONS_ENABLED ? DEMO_NOTIFICATIONS : []
const demoUnread = demo.filter((item) => !item.read).length

export function NotificationBell({
	initialUnread,
	labels
}: {
	initialUnread: number | null
	labels: BellLabels
}) {
	const [unread, setUnread] = useState(
		initialUnread == null ? initialUnread : initialUnread + demoUnread
	)
	const [panel, setPanel] = useState<Panel>({ state: 'closed' })
	const [filter, setFilter] = useState<Filter>('all')
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
			setUnread(result.data.unreadCount + demoUnread)
			setPanel({ state: 'ready', items: [...demo, ...result.data.items] })
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
		if (id.startsWith('demo-')) return
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
	const loaded = panel.state === 'ready' ? panel.items : []
	const items = filter === 'unread' ? loaded.filter((item) => !item.read) : loaded

	return (
		<div ref={rootRef} className="relative ml-auto">
			<button
				type="button"
				onClick={toggle}
				aria-expanded={open}
				aria-haspopup="dialog"
				data-unread={hasUnread ? 'true' : undefined}
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
					className="border-border bg-surface absolute right-0 z-20 mt-3 flex max-h-[min(40rem,calc(100dvh-6rem))] w-[min(26rem,calc(100vw-2rem))] flex-col gap-4 overflow-hidden rounded-3xl border p-5 shadow-2xl"
				>
					<div className="flex items-start justify-between gap-3">
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2.5">
								<span className="text-text text-2xl font-bold tracking-tight">
									{labels.heading}
								</span>
								{hasUnread ? (
									<span className="bg-accent/12 text-success rounded-full px-2.5 py-1 text-sm font-bold">
										{labels.newCount.replace('{count}', String(unread))}
									</span>
								) : null}
							</div>
							<p className="text-text-muted m-0 text-sm">{labels.subheading}</p>
						</div>
						<Link
							href="/settings"
							aria-label={labels.settings}
							onClick={() => setPanel({ state: 'closed' })}
							className="border-border-strong text-text-muted hover:bg-surface-hover hover:text-text grid size-10 shrink-0 place-items-center rounded-xl border"
						>
							<SlidersIcon size={20} />
						</Link>
					</div>

					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-1">
							<button
								type="button"
								aria-pressed={filter === 'all'}
								onClick={() => setFilter('all')}
								className={cn(
									'rounded-full px-4 py-2 text-sm font-semibold',
									filter === 'all'
										? 'bg-surface-hover text-text'
										: 'text-text-faint hover:text-text'
								)}
							>
								{labels.all}
							</button>
							<button
								type="button"
								aria-pressed={filter === 'unread'}
								onClick={() => setFilter('unread')}
								className={cn(
									'rounded-full px-4 py-2 text-sm font-semibold',
									filter === 'unread'
										? 'bg-surface-hover text-text'
										: 'text-text-faint hover:text-text'
								)}
							>
								{labels.unreadTab.replace('{count}', String(unread ?? 0))}
							</button>
						</div>
						{loaded.some((item) => !item.read) ? (
							<button
								type="button"
								onClick={markAll}
								disabled={pending}
								className="text-text-muted hover:text-text text-sm font-semibold"
							>
								{labels.markAll}
							</button>
						) : null}
					</div>

					{panel.state === 'loading' ? (
						<ul
							className="m-0 flex list-none flex-col gap-3 p-0"
							role="status"
							aria-label={labels.loading}
						>
							{[0, 1].map((row) => (
								<li
									key={row}
									aria-hidden="true"
									className="border-border bg-surface flex animate-pulse flex-col gap-3 rounded-2xl border p-4"
								>
									<div className="flex items-start gap-3.5">
										<span className="bg-surface-hover size-11 shrink-0 rounded-xl" />
										<div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
											<span className="bg-surface-hover h-4 w-2/5 rounded" />
											<span className="bg-surface-hover h-3 w-full rounded" />
											<span className="bg-surface-hover h-3 w-3/4 rounded" />
										</div>
									</div>
									<span className="bg-surface-hover h-8 w-28 rounded-full" />
								</li>
							))}
						</ul>
					) : panel.state === 'error' ? (
						<p className="text-warning m-0 py-6 text-sm" role="status">
							{labels.error}
						</p>
					) : items.length === 0 ? (
						<p className="text-text-muted m-0 py-6 text-sm">
							{filter === 'unread' && loaded.length > 0 ? labels.emptyUnread : labels.empty}
						</p>
					) : (
						<ul className="m-0 -mr-2 flex min-h-0 [scrollbar-width:thin] list-none flex-col gap-3 overflow-y-auto p-0 pr-2">
							{items.map((item) => (
								<li
									key={item.id}
									className={cn(
										'relative flex flex-col gap-3 rounded-2xl border p-4',
										item.read ? 'border-border bg-surface' : 'border-accent/25 bg-accent/8'
									)}
								>
									<div className="flex items-start gap-3.5">
										<span
											aria-hidden="true"
											className={cn(
												'grid size-11 shrink-0 place-items-center rounded-xl',
												item.read ? 'bg-surface-hover text-text-muted' : 'bg-accent/12 text-accent'
											)}
										>
											<CodeIcon size={22} />
										</span>
										<div className="flex min-w-0 flex-col gap-1">
											<span className="text-text pr-4 text-base font-semibold">{item.title}</span>
											<p className="text-text-muted m-0 text-sm leading-relaxed">{item.body}</p>
											{item.concept ? (
												<p className="text-text-muted m-0 text-xs">{item.concept}</p>
											) : null}
											<time dateTime={item.createdAt} className="text-text-faint text-xs">
												{relativeTime(item.createdAt)}
											</time>
										</div>
									</div>
									{!item.read ? (
										<span
											aria-hidden="true"
											className="bg-accent absolute top-4 right-4 size-2.5 rounded-full"
										/>
									) : null}
									<div className="flex items-center justify-between gap-3">
										<Link
											href={item.href}
											onClick={() => {
												if (!item.read) markOne(item.id)
												setPanel({ state: 'closed' })
											}}
											className="border-border-strong text-text-muted hover:bg-surface-hover hover:text-text inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
										>
											{item.cta}
											<ExternalLinkIcon size={14} />
										</Link>
										{!item.read ? (
											<button
												type="button"
												onClick={() => markOne(item.id)}
												className="text-text-muted hover:text-text px-2 text-sm font-semibold"
											>
												{labels.markRead}
											</button>
										) : null}
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
