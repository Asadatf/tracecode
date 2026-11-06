import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { AppShell } from '@/components/app-shell/app-shell'
import { PreviewWorkspace } from '@/components/exam/preview/preview-workspace'
import { PROBLEMS } from '@/lib/trace/problems'
import { toExamProblem } from '@/lib/challenge/exam-problem'
import { PREVIEW_PROBLEM_SLUG } from '@/lib/exam/preview-data'

export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Exam workspace (preview) | TraceCode', robots: { index: false, follow: false } }
}

// Screen 3. Same frame as the real exam and Practice (bare app shell, full-height panes). The
// problem is a PUBLIC catalogue problem; no exam problem is ever used in preview.
export default async function PreviewWorkspacePage() {
	const account = await currentAccountSafe()
	if (account == null) {
		redirect({
			href: `/login?next=${encodeURIComponent('/exam/preview/workspace')}`,
			locale: await getLocale()
		})
		return null
	}
	const problem = PROBLEMS[PREVIEW_PROBLEM_SLUG]
	if (problem == null) return null
	return (
		<AppShell bare startCollapsed current="problems">
			<div data-in-shell>
				<PreviewWorkspace problem={toExamProblem(problem)} />
			</div>
		</AppShell>
	)
}
