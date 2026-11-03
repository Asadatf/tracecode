import { Suspense, type ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { NotificationBellSlot } from '@/components/notifications/notification-bell-slot'
import { topicLabel } from '@/lib/home/problem-rows'
import { PROBLEMS } from '@/lib/trace/problems'
import { ProblemSearch } from './problem-search'
import { ShellFrame } from './shell-frame'
import styles from './app-shell.module.css'
import type { NavGroup, NavKey } from './sidebar-nav'

// The authenticated app frame: collapsible sidebar, top bar (search, bell,
// account) and a scrollable main region. A page adopts the shared look by
// wrapping its content in this and naming its own nav item
// (specs/features/dashboard-page.md AC17); nothing page-specific lives here.
// The slim problem list is built here so the client never receives test data.
export async function AppShell({ current, children }: { current: NavKey; children: ReactNode }) {
	const t = await getTranslations('AppShell')

	const groups: NavGroup[] = [
		{
			heading: t('groups.learn'),
			items: [
				{ key: 'overview', href: '/dashboard', label: t('nav.overview') },
				{ key: 'problems', href: '/#problems', label: t('nav.problems') },
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
			topbar={
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
			}
		>
			{children}
		</ShellFrame>
	)
}
