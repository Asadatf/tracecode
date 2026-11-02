import { topicLabel } from '@/lib/home/problem-rows'
import type { ProblemDefinition } from '@/lib/trace/problem'

// The dashboard's "From your activity" line names the *topics* of the problem
// the learner recently solved, not its slug: "You solved two-sum after some
// earlier…" becomes "You solved recent problems based on arrays and loops
// after some earlier…". Only the engine's own sentence is rewritten; any other
// summary (including an AI one) is shown exactly as it came.

const SOLVED_AFTER_STRUGGLE = /^You solved ([a-z0-9-]+) after some earlier unsuccessful attempts\./
const MAX_TOPICS = 2

export function topicsBySlug(problems: readonly ProblemDefinition[]): Record<string, string> {
	return Object.fromEntries(
		problems.map((problem) => [
			problem.slug,
			problem.conceptTags
				.slice(0, MAX_TOPICS)
				.map((tag) => topicLabel(tag).toLocaleLowerCase())
				.join(' and ')
		])
	)
}

export function withSolvedTopics(summary: string, topics: Record<string, string>): string {
	const match = SOLVED_AFTER_STRUGGLE.exec(summary)
	const slug = match?.[1]
	const phrase = slug == null ? undefined : topics[slug]
	if (slug == null || phrase == null || phrase === '') return summary
	return summary.replace(slug, `recent problems based on ${phrase}`)
}
