import { topicLabel } from '@/lib/home/problem-rows'
import type { ProblemDefinition } from '@/lib/trace/problem'

// The dashboard's insight line names the *topics* of what the learner solved,
// not a slug: "You solved two-sum after some earlier unsuccessful attempts."
// becomes "You've solved array and loop problems after earlier attempts. Ready
// for a new challenge?". Only the engine's own sentence is rewritten; any other
// summary (including an AI one) is shown exactly as it came.

const SOLVED_AFTER_STRUGGLE = /^You solved ([a-z0-9-]+) after some earlier unsuccessful attempts\./
const MAX_TOPICS = 2

// "Arrays" → "array", "Two-pointers" → "two-pointer", "Hashing" stays.
function singular(label: string): string {
	const lower = label.toLocaleLowerCase()
	return /(ss|ing)$/.test(lower) ? lower : lower.replace(/s$/, '')
}

// "Binary-search" → "Binary Search", for a chip.
export function chipLabel(tag: string): string {
	return tag
		.split('-')
		.map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
		.join(' ')
}

export function topicsBySlug(problems: readonly ProblemDefinition[]): Record<string, string> {
	return Object.fromEntries(
		problems.map((problem) => [
			problem.slug,
			problem.conceptTags
				.slice(0, MAX_TOPICS)
				.map((tag) => singular(topicLabel(tag)))
				.join(' and ')
		])
	)
}

export function insightSummary(summary: string, topics: Record<string, string>): string {
	const match = SOLVED_AFTER_STRUGGLE.exec(summary)
	const slug = match?.[1]
	const phrase = slug == null ? undefined : topics[slug]
	if (phrase == null || phrase === '') return summary
	return `You’ve solved ${phrase} problems after earlier attempts. Ready for a new challenge?`
}
