import { Suspense, type ReactNode } from 'react'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { NotificationBellSlot } from '@/components/notifications/notification-bell-slot'
import { topicLabel } from '@/lib/home/problem-rows'
import { PROBLEMS } from '@/lib/trace/problems'
import { ProblemSearch } from './problem-search'
import { ShellFrame } from './shell-frame'
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from './sidebar-state'
import styles from './app-shell.module.css'
import type { NavGroup, NavKey } from './sidebar-nav'

// The authenticated app frame: collapsible sidebar, top bar (search, bell,
// account) and a scrollable main region. A page adopts the shared look by
// wrapping its content in this and naming its own nav item
// (specs/features/dashboard-page.md AC17); nothing page-specific lives here.
// The slim problem list is built here so the client never receives test data.
export async function AppShell({
	current,
	bare = false,
	startCollapsed,
	children
}: {
	// The highlighted sidebar item; omit it on a page that has none (Practice).
	current?: NavKey
	// Hide the search box and the bell (the Practice page): the sidebar stays.
	bare?: boolean
	// Start the sidebar as the icon rail on this page whatever was saved (Practice
	// wants the room); toggling still works but is not remembered.
	startCollapsed?: boolean
	children: ReactNode
}) {
	const [t, cookieStore] = await Promise.all([getTranslations('AppShell'), cookies()])
	const initialCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED

	const groups: NavGroup[] = [
		{
			heading: t('groups.learn'),
			items: [
				{ key: 'overview', href: '/dashboard', label: t('nav.overview') },
				{ key: 'problems', href: '/problems', label: t('nav.problems') },
				{ key: 'progress', href: '/progress', label: t('nav.progress') }
			]
		},
		{
			heading: t('groups.account'),
			items: [{ key: 'settings', href: '/settings', label: t('nav.settings') }]
		}
	]
	const problems = Object.values(PROBLEMS).map((problem) => ({
		slug: problem.slug,
		title: problem.title,
		topics: problem.conceptTags.map(topicLabel).join(' · ')
	}))

	return (
		<ShellFrame
			groups={groups}
			current={current}
			labels={{
				home: t('home'),
				nav: t('navLabel'),
				collapse: t('collapse'),
				expand: t('expand'),
				openMenu: t('openMenu'),
				closeMenu: t('closeMenu'),
				signOut: t('account.signOut')
			}}
			bare={bare}
			initialCollapsed={startCollapsed ?? initialCollapsed}
			persistCollapsed={startCollapsed == null}
			topbar={
				bare ? null : (
					<>
						<ProblemSearch
							problems={problems}
							labels={{
								label: t('search.label'),
								placeholder: t('search.placeholder'),
								empty: t('search.empty')
							}}
						/>
						<div className={styles.actions}>
							<Suspense fallback={<span className="size-9" aria-hidden="true" />}>
								<NotificationBellSlot />
							</Suspense>
						</div>
					</>
				)
			}
		>
			{children}
		</ShellFrame>
	)
}
