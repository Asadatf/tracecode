import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { NotificationBellSlot } from '@/components/notifications/notification-bell-slot'

// The thin top bar (specs/features/home-page.md AC1/AC3, progress-page.md).
// No "Sign in" until there is a sign-in page (home-page.md, Decisions).
export async function SiteHeader() {
	const t = await getTranslations('SiteHeader')

	return (
		<header className="border-border bg-surface border-b">
			<div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center gap-x-7 gap-y-2 px-6 py-2">
				<Link
					href="/"
					aria-label={t('home')}
					className="text-text flex items-center gap-2 text-lg font-bold tracking-tight"
				>
					<span
						aria-hidden="true"
						className="bg-accent text-accent-ink grid size-7 place-items-center rounded-sm font-mono text-base font-bold"
					>
						⌁
					</span>
					tracecode
				</Link>
				<nav aria-label={t('nav')} className="flex flex-wrap gap-x-6 gap-y-1">
					<Link href="/#problems" className="text-text hover:text-accent font-semibold">
						{t('problems')}
					</Link>
				</nav>
				{/* M7.5B: the notification bell, signed-in learners only. Suspense so the
				    unread-count query never holds up the rest of the header. */}
				<Suspense fallback={null}>
					<NotificationBellSlot />
				</Suspense>
			</div>
		</header>
	)
}
