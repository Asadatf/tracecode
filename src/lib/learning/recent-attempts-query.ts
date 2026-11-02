// The learner's ten most recent attempts for the progress page. The `select` is
// deliberate: the page needs five scalar columns, so the query must not depend on
// (or read) anything else on `attempts` — not the full `source` text, and not
// `codeFeatures`, which does not exist in a database until its migration has run.
// Without it, deploying the app ahead of that migration would break /progress.
export const RECENT_ATTEMPTS_LIMIT = 10

export function recentAttemptsQuery(userId: string) {
	return {
		where: { userId },
		orderBy: { createdAt: 'desc' as const },
		take: RECENT_ATTEMPTS_LIMIT,
		select: {
			problemSlug: true,
			createdAt: true,
			testsPassed: true,
			testsTotal: true,
			allPassed: true
		}
	}
}
