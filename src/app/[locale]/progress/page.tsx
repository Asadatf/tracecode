import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { PROBLEMS } from '@/lib/trace/problems'
import { buildProgressView } from '@/lib/progress/progress-view'
import { getLearningProgress } from '@/server/learning/progress'
import { SiteHeader } from '@/components/site-header'
import { ProgressEmpty } from '@/components/progress/progress-empty'
import { ProgressSections } from '@/components/progress/progress-sections'
import { RecommendationCard } from '@/components/progress/recommendation-card'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/server/actions/auth'
import { getRecommendation, isRecommendationAiEnabled } from '@/server/learning/recommendation'

// specs/features/progress-page.md. A personal page, not a marketing one →
// noindex (which also opts it out of the SEO PUBLIC_PAGES requirement).
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('ProgressPage')
	return { title: t('metaTitle'), robots: { index: false } }
}

export default async function ProgressPage() {
	// getRecommendation never calls OpenRouter, so fetching it alongside progress
	// adds no AI request to a page load (M7.5A). Both degrade on their own.
	const [t, progress, recommendation] = await Promise.all([
		getTranslations('ProgressPage'),
		getLearningProgress(),
		getRecommendation()
	])

	let content: React.ReactNode
	if (!progress.authenticated) content = <ProgressEmpty />
	else if (!progress.available) content = <p className="text-warning m-0">{t('unavailable')}</p>
	else
		content = (
			<>
				{recommendation.authenticated && recommendation.available ? (
					<RecommendationCard
						recommendation={recommendation.recommendation}
						canRefresh={isRecommendationAiEnabled()}
					/>
				) : null}
				<ProgressSections view={buildProgressView(Object.values(PROBLEMS), progress)} />
			</>
		)

	return (
		<>
			<SiteHeader current="progress" />
			<main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 pt-12 pb-16">
				<div className="flex items-center justify-between gap-3">
					<h1 className="m-0 text-3xl font-bold tracking-tight">{t('heading')}</h1>
					{progress.authenticated ? (
						<form action={signOutAction}>
							<Button type="submit" variant="outline" size="sm">
								Sign out
							</Button>
						</form>
					) : (
						<Link href="/login" className="text-accent hover:text-accent-hover font-semibold">
							Sign in
						</Link>
					)}
				</div>
				{content}
			</main>
		</>
	)
}
