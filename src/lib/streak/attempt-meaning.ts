import { PROBLEMS } from '../trace/problems'
import { isMeaningfulChange } from './meaningful-code'

// The server's verdict on whether a saved attempt is a real piece of work, for
// the streak (specs/features/streak.md AC4). It is computed ONLY from the
// canonical catalogue starter and the submitted source: the browser never sends
// this value, and anything it sends under that name is ignored. An unknown
// problem slug cannot be compared to a starter, so it is not meaningful.
export function isMeaningfulAttempt(problemSlug: string, source: string): boolean {
	const problem = Object.hasOwn(PROBLEMS, problemSlug) ? PROBLEMS[problemSlug] : undefined
	return problem != null && isMeaningfulChange(source, problem.starter)
}
