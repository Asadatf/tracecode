import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { pageMetadata } from '@/lib/seo/metadata'
import { traceResultSchema } from '@/lib/trace/contract'
import { PROBLEMS, twoSum } from '@/lib/trace/problems'
import buggyTwoSum from '@/lib/trace/fixtures/buggy-two-sum.json'
import { buildTwoSumDemo } from '@/lib/home/two-sum-demo'
import { buildProblemTable } from '@/lib/home/problem-rows'
import { getLearningProgress } from '@/server/learning/progress'
import { SiteHeader } from '@/components/site-header'
import { TraceDemo } from '@/components/home/trace-demo'
import { ProblemTable } from '@/components/home/problem-table'

// specs/features/home-page.md. The failing Two Sum test the step table shows.
const DEMO_TEST_ID = 't2'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
	return pageMetadata({ path: '/', locale: (await params).locale })
}

export default async function HomePage() {
	const [t, progress] = await Promise.all([getTranslations('HomePage'), getLearningProgress()])

	const demoTest = twoSum.tests.find((test) => test.id === DEMO_TEST_ID)
	if (demoTest == null) throw new Error(`Two Sum has no test ${DEMO_TEST_ID}`)
	const demo = buildTwoSumDemo(traceResultSchema.parse(buggyTwoSum), demoTest, twoSum.entry)
	const table = buildProblemTable(Object.values(PROBLEMS), progress)

	return (
		<>
			<SiteHeader />
			<main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 pt-14 pb-16">
				<section className="flex flex-wrap items-center gap-10">
					<div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5">
						<h1 className="text-text m-0 text-4xl leading-tight font-bold tracking-tight">
							{t('title')}
						</h1>
						<p className="text-text-muted m-0 text-lg leading-relaxed">{t('description')}</p>
						<div className="flex flex-wrap items-center gap-5 pt-1.5">
							<Link
								href={`/practice/${twoSum.slug}`}
								className="bg-accent text-accent-ink hover:bg-accent-hover rounded-sm px-4.5 py-3 font-semibold"
							>
								{t('cta')}
							</Link>
							<Link href="/#problems" className="text-accent hover:text-accent-hover font-semibold">
								{t('seeAll')}
							</Link>
						</div>
					</div>
					<TraceDemo demo={demo} />
				</section>
				<ProblemTable table={table} />
			</main>
		</>
	)
}
