import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'

// The thin top bar (specs/features/home-page.md AC1/AC3, progress-page.md AC1).
// No "Sign in" until there is a sign-in page (home-page.md, Decisions).
export async function SiteHeader({ current }: { current?: 'progress' } = {}) {
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
					<Link
						href="/#problems"
						className={cn(
							'hover:text-accent',
							current == null ? 'text-text font-semibold' : 'text-text-muted'
						)}
					>
						{t('problems')}
					</Link>
					<Link
						href="/progress"
						aria-current={current === 'progress' ? 'page' : undefined}
						className={cn(
							'hover:text-accent',
							current === 'progress' ? 'text-text font-semibold' : 'text-text-muted'
						)}
					>
						{t('progress')}
					</Link>
				</nav>
			</div>
		</header>
	)
}
