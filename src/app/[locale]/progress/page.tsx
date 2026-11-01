import type { Metadata } from 'next'
import { getLearningProgress } from '@/server/learning/progress'

// A personal learning-progress view, not a marketing page → noindex (which also
// opts it out of the SEO PUBLIC_PAGES requirement).
export const metadata: Metadata = {
	title: 'Your progress — TraceCode',
	robots: { index: false }
}

export default async function ProgressPage() {
	const view = await getLearningProgress()

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
			<h1 className="text-text text-3xl font-semibold">Your progress</h1>

			{!view.authenticated && (
				<p className="text-text-muted text-sm">
					Sign in to save your attempts across devices. Until then, your attempts are kept locally
					in your browser on each problem page.
				</p>
			)}

			{view.authenticated && !view.available && (
				<p className="text-warning text-sm">
					Saved progress is unavailable right now (the learning tables are not migrated or the
					database is unreachable). Your attempts are still kept locally in your browser.
				</p>
			)}

			{view.authenticated && view.available && (
				<>
					<section className="flex flex-col gap-2">
						<h2 className="text-text text-lg font-medium">Problems</h2>
						{view.progress.length === 0 ? (
							<p className="text-text-muted text-sm">No attempts saved yet.</p>
						) : (
							<ul className="flex flex-col gap-1">
								{view.progress.map((p) => (
									<li
										key={p.problemSlug}
										className="border-border flex items-center justify-between rounded border px-3 py-2 text-sm"
									>
										<span className="text-text font-medium">{p.problemSlug}</span>
										<span className="text-text-muted">
											{p.status} · best {p.bestTestsPassed}/{p.testsTotal} · {p.attempts} attempts
										</span>
									</li>
								))}
							</ul>
						)}
					</section>

					<section className="flex flex-col gap-2">
						<h2 className="text-text text-lg font-medium">Recent attempts</h2>
						{view.recentAttempts.length === 0 ? (
							<p className="text-text-muted text-sm">Nothing yet.</p>
						) : (
							<ul className="flex flex-col gap-1">
								{view.recentAttempts.map((a, i) => (
									<li
										key={i}
										className="border-border flex items-center justify-between rounded border px-3 py-2 text-sm"
									>
										<span className="text-text">{a.problemSlug}</span>
										<span className={a.allPassed ? 'text-success' : 'text-text-muted'}>
											{a.testsPassed}/{a.testsTotal} · {new Date(a.createdAt).toLocaleString()}
										</span>
									</li>
								))}
							</ul>
						)}
					</section>
				</>
			)}
		</main>
	)
}
