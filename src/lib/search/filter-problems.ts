// The app shell's problem search (specs/features/dashboard-page.md AC10): a
// case-insensitive match on title or topic over the slim catalogue the server
// hands the client, so no request is made and no test data reaches the bundle.

export interface SearchableProblem {
	slug: string
	title: string
	topics: string
}

export const MAX_SEARCH_RESULTS = 6

export function filterProblems(
	problems: readonly SearchableProblem[],
	query: string
): SearchableProblem[] {
	const needle = query.trim().toLocaleLowerCase()
	if (needle === '') return []
	const matches = problems.filter(
		(problem) =>
			problem.title.toLocaleLowerCase().includes(needle) ||
			problem.topics.toLocaleLowerCase().includes(needle)
	)
	// Title hits first: "sum" should surface Two Sum before a topic match.
	matches.sort(
		(a, b) =>
			Number(!a.title.toLocaleLowerCase().includes(needle)) -
			Number(!b.title.toLocaleLowerCase().includes(needle))
	)
	return matches.slice(0, MAX_SEARCH_RESULTS)
}
