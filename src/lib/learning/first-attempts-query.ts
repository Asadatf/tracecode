// The time of a learner's first attempt on each problem, for the problem-detail
// modal's "First attempted". One aggregate over `attempts`, grouped by problem, so
// it returns at most one row per catalogue problem and never any source text,
// results or replays. It takes the session user id and puts it in the WHERE; it
// accepts a user id from nowhere else.

export function firstAttemptsQuery(userId: string) {
	return {
		by: ['problemSlug' as const],
		where: { userId },
		_min: { createdAt: true as const }
	}
}

export function toFirstAttempts(
	rows: readonly { problemSlug: string; _min: { createdAt: Date | null } }[]
): Record<string, string> {
	return Object.fromEntries(
		rows.flatMap((row) =>
			row._min.createdAt == null ? [] : [[row.problemSlug, row._min.createdAt.toISOString()]]
		)
	)
}
