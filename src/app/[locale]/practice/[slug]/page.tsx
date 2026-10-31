import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DM_Sans, JetBrains_Mono } from 'next/font/google'
import { PROBLEMS } from '@/lib/trace/problems'
import { PracticeWorkspace } from '@/components/trace/practice-workspace'

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--tc-sans' })
const jetBrainsMono = JetBrains_Mono({
	subsets: ['latin'],
	weight: ['400', '600', '700'],
	variable: '--tc-mono'
})

// A practice/learning route, not a marketing page: it opts out of the index
// (dynamic [slug] routes are skipped by the SEO check regardless).
export async function generateMetadata({
	params
}: {
	params: Promise<{ slug: string }>
}): Promise<Metadata> {
	const { slug } = await params
	const problem = PROBLEMS[slug]
	return {
		title: problem != null ? `${problem.title} — TraceCode` : 'TraceCode',
		robots: { index: false }
	}
}

export default async function PracticePage({
	params
}: {
	params: Promise<{ locale: string; slug: string }>
}) {
	const { slug } = await params
	const problem = PROBLEMS[slug]
	if (problem == null) notFound()
	return (
		<div className={`${dmSans.variable} ${jetBrainsMono.variable}`}>
			<PracticeWorkspace problem={problem} />
		</div>
	)
}
