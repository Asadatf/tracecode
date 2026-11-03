'use client'

import { useRef, useSyncExternalStore, type ReactNode } from 'react'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { CloseIcon, MenuIcon, SidebarIcon } from '@/components/ui/icons'
import { SidebarNav, type NavGroup, type NavKey } from './sidebar-nav'
import styles from './app-shell.module.css'

const STORAGE_KEY = 'tc-sidebar-collapsed'
const CHANGE_EVENT = 'tc-sidebar-change'

// The collapsed choice lives in localStorage, read through useSyncExternalStore
// so the server render (expanded) and the first client render agree. Storage
// can throw (private windows, blocked site data): a module-level fallback keeps
// the toggle working for the page's lifetime, and the page never depends on it.
let memory = false

function subscribe(onChange: () => void) {
	window.addEventListener('storage', onChange)
	window.addEventListener(CHANGE_EVENT, onChange)
	return () => {
		window.removeEventListener('storage', onChange)
		window.removeEventListener(CHANGE_EVENT, onChange)
	}
}
function readCollapsed(): boolean {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored != null) return stored === '1'
	} catch {
		// fall through to the in-memory value
	}
	return memory
}
function writeCollapsed(next: boolean) {
	memory = next
	try {
		window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
	} catch {
		// in-memory only
	}
	window.dispatchEvent(new Event(CHANGE_EVENT))
}

export interface ShellLabels {
	home: string
	nav: string
	collapse: string
	expand: string
	openMenu: string
	closeMenu: string
	signOut: string
}

// Client half of the shell: the collapsible rail, the mobile drawer, and the
// frame the page content sits in. The top bar and page content arrive as
// server-rendered slots.
export function ShellFrame({
	groups,
	current,
	labels,
	topbar,
	children
}: {
	groups: NavGroup[]
	current: NavKey
	labels: ShellLabels
	topbar: ReactNode
	children: ReactNode
}) {
	const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false)
	const drawerRef = useRef<HTMLDialogElement>(null)

	const brand = (
		<Link href="/" aria-label={labels.home} className={styles.brand}>
			<span aria-hidden="true" className={styles.brandMark}>
				⌁
			</span>
			<span className={styles.brandName}>tracecode</span>
		</Link>
	)

	return (
		<div className={styles.frame} data-collapsed={collapsed}>
			<aside className={styles.sidebar}>
				<div className={styles.sidebarCard}>
					<div className={styles.sidebarTop}>
						{brand}
						<button
							type="button"
							className={styles.iconButton}
							aria-expanded={!collapsed}
							aria-label={collapsed ? labels.expand : labels.collapse}
							data-tip={collapsed ? labels.expand : labels.collapse}
							onClick={() => writeCollapsed(!collapsed)}
						>
							<SidebarIcon size={20} />
						</button>
					</div>
					<nav aria-label={labels.nav} className={styles.sidebarNav}>
						<SidebarNav groups={groups} current={current} signOutLabel={labels.signOut} />
					</nav>
				</div>
			</aside>

			<div className={styles.content}>
				<header className={styles.topbar}>
					<button
						type="button"
						className={cn(styles.iconButton, styles.menuButton)}
						aria-label={labels.openMenu}
						onClick={() => drawerRef.current?.showModal()}
					>
						<MenuIcon size={20} />
					</button>
					{topbar}
				</header>
				<main className={styles.main}>{children}</main>
			</div>

			<dialog
				ref={drawerRef}
				className={styles.drawer}
				aria-label={labels.nav}
				onClick={(event) => {
					if (event.target === event.currentTarget) event.currentTarget.close()
				}}
			>
				<div className={styles.drawerCard}>
					<div className={styles.sidebarTop}>
						{brand}
						<button
							type="button"
							className={styles.iconButton}
							aria-label={labels.closeMenu}
							onClick={() => drawerRef.current?.close()}
						>
							<CloseIcon size={20} />
						</button>
					</div>
					<nav aria-label={labels.nav} className={styles.sidebarNav}>
						<SidebarNav
							groups={groups}
							current={current}
							signOutLabel={labels.signOut}
							onNavigate={() => drawerRef.current?.close()}
						/>
					</nav>
				</div>
			</dialog>
		</div>
	)
}
