import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'

// /progress for a signed-out visitor (specs/features/progress-page.md, AC2).
export async function ProgressEmpty() {
	const t = await getTranslations('ProgressPage.signedOut')
	const shows = ['shows.problems', 'shows.recent', 'shows.topics'] as const

	return (
		<>
			<section className="border-border bg-surface flex max-w-2xl flex-col gap-3 rounded-sm border p-6">
				<h2 className="m-0 text-lg font-bold">{t('heading')}</h2>
				<p className="text-text-muted m-0 leading-relaxed">{t('body')}</p>
				<div className="flex flex-wrap items-center gap-5 pt-1">
					<Link
						href="/practice/two-sum"
						className="bg-accent text-accent-ink hover:bg-accent-hover rounded-sm px-4.5 py-3 font-semibold"
					>
						{t('cta')}
					</Link>
					<Link href="/#problems" className="text-accent hover:text-accent-hover font-semibold">
						{t('seeAll')}
					</Link>
				</div>
			</section>
			<section className="flex max-w-2xl flex-col gap-2">
				<h2 className="m-0 text-base font-bold">{t('showsHeading')}</h2>
				<ul className="text-text-muted m-0 list-disc pl-5 leading-loose">
					{shows.map((key) => (
						<li key={key}>{t(key)}</li>
					))}
				</ul>
			</section>
		</>
	)
}
