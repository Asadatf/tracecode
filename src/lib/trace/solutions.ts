import { DEFAULT_LIMITS } from './contract'
import { REFERENCE_SOLUTIONS, type ReferenceSolution } from './reference-solutions'

// The Solutions tab's rules (specs/features/solutions-tab.md), kept pure so they
// unit-test without the engine or React.

// Failed runs after which a stuck learner may reveal the solutions (AC3).
export const REVEAL_AFTER_FAILED_RUNS = 3

export type SolutionsAccess = 'unlocked' | 'can-reveal' | 'locked'

export function solutionsAccess(state: {
	solved: boolean
	failedRuns: number
	revealed: boolean
}): SolutionsAccess {
	if (state.solved || state.revealed) return 'unlocked'
	return state.failedRuns >= REVEAL_AFTER_FAILED_RUNS ? 'can-reveal' : 'locked'
}

// What the tab lists (AC5): passing solutions only, straightforward first, each
// kind in the order the file gives them.
export function shownSolutions(slug: string): ReferenceSolution[] {
	const passing = (REFERENCE_SOLUTIONS[slug] ?? []).filter((s) => s.passes)
	return [
		...passing.filter((s) => s.kind === 'straightforward'),
		...passing.filter((s) => s.kind === 'optimized')
	]
}

// The optimised approach a learner's solution is compared with (AC7).
export function comparisonTarget(slug: string): ReferenceSolution | undefined {
	return shownSolutions(slug).find((s) => s.kind === 'optimized')
}

export interface StepCount {
	steps: number
	// The trace hit the step cap, so `steps` is a floor, not the real count (AC8).
	truncated: boolean
}

const number = (n: number) => n.toLocaleString('en-US')

export function stepLabel(count: StepCount): string {
	return count.truncated
		? `more than ${number(DEFAULT_LIMITS.maxSteps)} steps`
		: `${number(count.steps)} steps`
}

// How much more work counts as a real difference rather than noise from a
// line or two of setup.
const CLEARLY_MORE = 1.5

// One plain sentence on what the two step counts mean (AC7, AC8).
export function comparisonSentence(you: StepCount, best: StepCount): string {
	if (you.truncated && !best.truncated) {
		return `Your solution took ${stepLabel(you)} on this input, against ${stepLabel(best)} for the optimised approach. The gap gets bigger as the input grows.`
	}
	if (you.truncated || best.truncated) {
		return 'Both approaches ran past the step limit on this input, so the counts cannot be compared.'
	}
	if (you.steps >= best.steps * CLEARLY_MORE) {
		const times = Math.round(you.steps / Math.max(best.steps, 1))
		return `Your solution did about ${times}× as much work as the optimised approach on this input. The gap gets bigger as the input grows.`
	}
	if (you.steps < best.steps) {
		return 'Your solution did less work than the optimised approach here. If it uses a built-in like sorted(), that work happens inside Python itself and is not counted as steps.'
	}
	return 'Your solution and the optimised approach did a similar amount of work on this input.'
}
