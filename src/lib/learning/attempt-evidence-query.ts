import { EVOLUTION_WINDOW } from './solution-evolution'

// The query behind one problem's solution-evolution window (M7.2), kept pure like
// the other query shapes so the properties that matter are unit-tested without a
// database: it is scoped to the signed-in learner, bounded to the latest few
// attempts, deterministic about ties, and it never selects `source`. The
// fingerprint and outcomes are all the evidence needs, so the learner's code is not
// read back at all.
//
// `withFeatures: false` leaves out `codeFeatures`, for a database that has not run
// that column's migration yet.
export function attemptEvidenceQuery(userId: string, problemSlug: string, withFeatures: boolean) {
	return {
		where: { userId, problemSlug },
		// Newest first so `take` keeps the latest; the same time-then-id order the
		// sequence builder sorts by.
		orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
		take: EVOLUTION_WINDOW,
		select: {
			id: true,
			problemSlug: true,
			createdAt: true,
			status: true,
			testsPassed: true,
			testsTotal: true,
			allPassed: true,
			...(withFeatures ? { codeFeatures: true } : {}),
			testResults: { where: { passed: false }, select: { testId: true } }
		}
	}
}
