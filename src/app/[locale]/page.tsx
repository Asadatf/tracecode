import { getLocale, getTranslations } from 'next-intl/server'
import { Link, redirect } from '@/i18n/routing'
import { Surface } from '@/components/navigation/navigation-curtain'
import { currentUserIdSafe } from '@/server/auth/session'
import { pageMetadata } from '@/lib/seo/metadata'
import { traceResultSchema } from '@/lib/trace/contract'
import { PROBLEMS, twoSum } from '@/lib/trace/problems'
import buggyTwoSum from '@/lib/trace/fixtures/buggy-two-sum.json'
import { buildTwoSumDemo } from '@/lib/home/two-sum-demo'
import { buildProblemTable } from '@/lib/home/problem-rows'
import { getLearningProgress } from '@/server/learning/progress'
import { ProblemTable } from '@/components/home/problem-table'
import { LandingHeader } from '@/components/home/landing-header'
import { LandingCursor } from '@/components/home/landing-cursor'
import { ScrollReveal } from '@/components/home/scroll-reveal'
import { ExecutionTour } from '@/components/home/execution-tour'
import {
	ClosingCta,
	LandingFooter,
	LearningLoop,
	TraceNarrative
} from '@/components/home/landing-sections'
import styles from '@/components/home/landing.module.css'

// specs/features/home-page.md. The failing Two Sum test the step table shows.
const DEMO_TEST_ID = 't2'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
	return pageMetadata({ path: '/', locale: (await params).locale })
}

export default async function HomePage() {
	// The landing page is for visitors; a signed-in learner belongs in the app
	// (specs/features/home-page.md, AC16).
	if ((await currentUserIdSafe()) != null) {
		redirect({ href: '/dashboard', locale: await getLocale() })
	}
	const [t, progress] = await Promise.all([getTranslations('HomePage'), getLearningProgress()])

	const demoTest = twoSum.tests.find((test) => test.id === DEMO_TEST_ID)
	if (demoTest == null) throw new Error(`Two Sum has no test ${DEMO_TEST_ID}`)
	const demo = buildTwoSumDemo(traceResultSchema.parse(buggyTwoSum), demoTest, twoSum.entry)
	const table = buildProblemTable(Object.values(PROBLEMS), progress)

	return (
		<Surface tone="dark">
			<div className={styles.page}>
				<ScrollReveal />
				<LandingCursor />
				<LandingHeader />
				<main>
					<div className={styles.heroShell} data-cursor-dark>
						<section className={styles.hero} aria-labelledby="landing-title">
							<div className={styles.heroCopy}>
								<p className={styles.heroEyebrow}>{t('eyebrow')}</p>
								<h1 id="landing-title" className={styles.heroTitle}>
									{t('title')}
								</h1>
								<p className={styles.heroDescription}>{t('description')}</p>
								<div className={styles.heroActions}>
									<Link href={`/practice/${twoSum.slug}`} className={styles.primaryCta}>
										{t('cta')}
									</Link>
									<a href="#narrative-title" className={styles.secondaryCta}>
										{t('exploreDemo')}
									</a>
									<a href="#problems" className={styles.textCta}>
										{t('seeAll')} <span aria-hidden="true">↓</span>
									</a>
								</div>
								<p className={styles.trustLine}>{t('trust')}</p>
							</div>
							<ExecutionTour demo={demo} />
						</section>
					</div>
					<TraceNarrative demo={demo} />
					<LearningLoop />
					<ProblemTable table={table} authenticated={progress.authenticated} />
					<ClosingCta />
				</main>
				<LandingFooter />
			</div>
		</Surface>
	)
}
