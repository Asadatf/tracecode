import type { ReactNode } from 'react'
import { getLocale } from 'next-intl/server'
import { Link, redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { AppShell } from '@/components/app-shell/app-shell'
import dashboard from '@/components/dashboard/dashboard.module.css'
import styles from './preview.module.css'

// The shared frame of the Daily Exam PREVIEW screens. Signed-in learners only (an explicit,
// access-controlled demo route), noindex, and always labelled: nothing here is real exam data.
export const PREVIEW_STEPS = [
	{ key: 'landing', href: '/exam/preview', label: '1 · Daily Exam' },
	{ key: 'preflight', href: '/exam/preview/preflight', label: '2 · Readiness' },
	{ key: 'workspace', href: '/exam/preview/workspace', label: '3 · Workspace' },
	{ key: 'result', href: '/exam/preview/result', label: '4 · Result' },
	{ key: 'leaderboard', href: '/exam/preview/leaderboard', label: '5 · Leaderboard' },
	{ key: 'archive', href: '/exam/preview/archive', label: '6 · Archive' }
] as const
export type PreviewStep = (typeof PREVIEW_STEPS)[number]['key']

export async function PreviewFrame({
	step,
	eyebrow,
	title,
	children
}: {
	step: PreviewStep
	eyebrow: string
	title: string
	children: ReactNode
}) {
	const account = await currentAccountSafe()
	if (account == null) {
		redirect({
			href: `/login?next=${encodeURIComponent('/exam/preview')}`,
			locale: await getLocale()
		})
		return null
	}
	return (
		<AppShell current="problems">
			<header className={dashboard.head}>
				<p className={dashboard.eyebrow}>{eyebrow}</p>
				<h1 className={dashboard.title}>{title}</h1>
			</header>
			<div className={styles.banner} role="note">
				<strong>Preview mode</strong>
				<span>
					Sample data for a guided walkthrough. Nothing on these screens is a real exam, grade,
					ranking or AI result, and nothing is saved or credited.
				</span>
			</div>
			<ol className={styles.steps} aria-label="Walkthrough">
				{PREVIEW_STEPS.map((s) => (
					<li key={s.key}>
						<Link
							href={s.href}
							className={styles.step}
							aria-current={s.key === step ? 'page' : undefined}
						>
							{s.label}
						</Link>
					</li>
				))}
			</ol>
			{children}
		</AppShell>
	)
}
