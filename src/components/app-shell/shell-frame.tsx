'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { CloseIcon, MenuIcon, SidebarIcon } from '@/components/ui/icons'
import { SidebarNav, type NavGroup, type NavKey } from './sidebar-nav'
import { sidebarCookie } from './sidebar-state'
import styles from './app-shell.module.css'

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
	initialCollapsed,
	persistCollapsed,
	bare = false,
	children
}: {
	groups: NavGroup[]
	current?: NavKey
	labels: ShellLabels
	topbar: ReactNode
	// No search or bell: the desktop top bar disappears and content starts higher.
	bare?: boolean
	// Read from the cookie on the server, so the first paint is already right.
	initialCollapsed: boolean
	// False when the page forces its own starting state, so toggling there doesn't
	// overwrite the choice other pages remember.
	persistCollapsed: boolean
	children: ReactNode
}) {
	const [collapsed, setCollapsed] = useState(initialCollapsed)
	const drawerRef = useRef<HTMLDialogElement>(null)

	function toggle() {
		const next = !collapsed
		setCollapsed(next)
		if (persistCollapsed) document.cookie = sidebarCookie(next)
	}

	// The app's home is the dashboard, never the marketing page (home-page AC16).
	const brand = (
		<Link href="/dashboard" aria-label={labels.home} className={styles.brand}>
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
							onClick={() => toggle()}
						>
							<SidebarIcon size={20} />
						</button>
					</div>
					<nav aria-label={labels.nav} className={styles.sidebarNav}>
						<SidebarNav groups={groups} current={current} signOutLabel={labels.signOut} />
					</nav>
				</div>
			</aside>

			<div className={styles.content} data-bare={bare}>
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
