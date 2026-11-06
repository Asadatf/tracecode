import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { authHref } from '@/lib/auth/return-to'
import { practiceAccess } from '@/lib/auth/access'
import { DM_Sans, JetBrains_Mono } from 'next/font/google'
import { PROBLEMS } from '@/lib/trace/problems'
import { AppShell } from '@/components/app-shell/app-shell'
import { LandingHeader } from '@/components/home/landing-header'
import { PracticeWorkspace } from '@/components/trace/practice-workspace'
import { getProblemNote } from '@/server/learning/notes'
import { CodeFeatureBackfill } from '@/components/trace/code-feature-backfill'
import { currentUserIdSafe } from '@/server/auth/session'
import { LAYOUT_COOKIE, parseLayoutCookie } from '@/lib/trace/workspace-layout'

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
		title: problem != null ? `${problem.title} | TraceCode` : 'TraceCode',
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

	// Auth drives whether the workspace syncs to the server. No session (or
	// Supabase unconfigured) → Two Sum still works fully (Pyodide is
	// client-side; attempts stay local). Every other problem needs an account:
	// enforced here, on the server, not just by hiding links
	// (specs/features/auth-access.md AC3/AC4).
	const userId = await currentUserIdSafe()
	const isAuthenticated = userId != null
	if (practiceAccess(slug, isAuthenticated) === 'sign-in') {
		redirect({ href: authHref('login', `/practice/${slug}`), locale: await getLocale() })
	}

	// A signed-in learner gets the app shell (sidebar, search, bell) around the
	// unchanged workspace; a guest on Two Sum keeps the standalone page, since
	// the shell is account-only.
	// The saved pane sizes, read here so the first paint already matches them (AC7).
	// The note is read alongside the layout, not after it (specs/features/problem-notes.md).
	const [cookieStore, initialNote] = await Promise.all([
		cookies(),
		isAuthenticated ? getProblemNote(slug) : Promise.resolve(null)
	])
	const initialLayout = parseLayoutCookie(cookieStore.get(LAYOUT_COOKIE)?.value)
	const workspace = (
		<PracticeWorkspace
			slug={slug}
			isAuthenticated={isAuthenticated}
			userId={userId}
			initialLayout={initialLayout}
			guestHeader={<LandingHeader showNav={false} />}
			initialNote={initialNote}
		/>
	)

	return (
		<div className={`${dmSans.variable} ${jetBrainsMono.variable}`}>
			{isAuthenticated ? (
				<AppShell bare startCollapsed>
					<div data-in-shell>{workspace}</div>
				</AppShell>
			) : (
				workspace
			)}
			{isAuthenticated && <CodeFeatureBackfill />}
		</div>
	)
}
