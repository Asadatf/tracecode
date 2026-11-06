'use client'

import { Link } from '@/i18n/routing'
import { SignOutForm } from '@/components/auth/sign-out-form'
import {
	CodeIcon,
	DashboardIcon,
	SettingsIcon,
	SignOutIcon,
	TimerIcon
} from '@/components/ui/icons'
import styles from './app-shell.module.css'

export type NavKey = 'overview' | 'problems' | 'exam' | 'settings'

export interface NavItem {
	key: NavKey
	href: string
	label: string
}

export interface NavGroup {
	heading: string
	items: NavItem[]
}

const ICONS = {
	overview: DashboardIcon,
	problems: CodeIcon,
	exam: TimerIcon,
	settings: SettingsIcon
} as const

// One nav list for both the desktop rail and the mobile drawer. When the rail
// is collapsed the label stays in the DOM (it is the link's accessible name)
// and a CSS tooltip repeats it on hover and focus.
export function SidebarNav({
	groups,
	current,
	signOutLabel,
	onNavigate
}: {
	groups: NavGroup[]
	current?: NavKey
	// Adds a Sign out entry at the end of the last group.
	signOutLabel: string
	onNavigate?: () => void
}) {
	return (
		<>
			{groups.map((group, groupIndex) => (
				<div key={group.heading} className={styles.group}>
					<p className={styles.groupHeading}>{group.heading}</p>
					<ul
						className={
							groupIndex === groups.length - 1
								? `${styles.navList} ${styles.accountRow}`
								: styles.navList
						}
					>
						{group.items.map((item) => {
							const Icon = ICONS[item.key]
							return (
								<li key={item.key}>
									<Link
										href={item.href}
										className={styles.navLink}
										data-tip={item.label}
										aria-current={item.key === current ? 'page' : undefined}
										onClick={onNavigate}
									>
										<Icon size={20} />
										<span className={styles.navLabel}>{item.label}</span>
									</Link>
								</li>
							)
						})}
						{groupIndex === groups.length - 1 ? (
							<li>
								<SignOutForm>
									<button
										type="submit"
										className={styles.signOutIcon}
										aria-label={signOutLabel}
										data-tip={signOutLabel}
									>
										<SignOutIcon size={20} />
									</button>
								</SignOutForm>
							</li>
						) : null}
					</ul>
				</div>
			))}
		</>
	)
}
