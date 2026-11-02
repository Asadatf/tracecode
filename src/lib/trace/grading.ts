import type { RunRequest } from './contract'
import type { ProblemDefinition } from './problem'

// Turns a problem's official tests into the engine's run request. For ordinary
// problems that is the identity. For an in-place (`mutate-arg`) problem like
// Move Zeroes the function returns nothing, so comparing its return value would
// grade nothing; instead a tiny harness is APPENDED to the learner's source and
// becomes the entry, returning the argument after the call. The worker, the run
// program and the run contract are untouched — the engine still just calls an
// entry and compares its return value to `expected`. Appending (never
// prepending) keeps every learner line number intact. Replays still trace the
// learner's own function directly, so the debugger shows their real frames.

export const GRADE_ENTRY = '__tracecode_grade__'

// Prefix of the failure text the harness returns when the function handed back
// a value instead of changing the argument. teach.ts keys off it.
export const NOT_IN_PLACE_PREFIX = 'Returned a different object instead of changing '

function definesEntry(source: string, entry: string): boolean {
	return new RegExp(`^[ \\t]*def[ \\t]+${entry}[ \\t]*\\(`, 'm').test(source)
}

// Returning the very same list is tolerated (the return value is ignored, as the
// judge for this problem does); returning anything else is reported as the
// actual value so the learner sees it was not an in-place change.
function mutateHarness(problem: ProblemDefinition, argIndex: number): string {
	const name = problem.params[argIndex]?.name ?? 'the argument'
	return [
		'',
		'',
		`def ${GRADE_ENTRY}(*args):`,
		`    target = args[${argIndex}]`,
		`    returned = ${problem.entry}(*args)`,
		'    if returned is not None and returned is not target:',
		`        return ${JSON.stringify(NOT_IN_PLACE_PREFIX + name + ': ')} + repr(returned)[:80]`,
		'    return target',
		''
	].join('\n')
}

export function buildRunRequest(
	problem: ProblemDefinition,
	source: string,
	limits: RunRequest['limits']
): RunRequest {
	const grading = problem.grading
	if (grading == null || grading.mode === 'return' || !definesEntry(source, problem.entry)) {
		// A missing entry is left to the engine, which reports entry_not_found.
		return { code: source, entry: problem.entry, tests: problem.tests, limits }
	}
	return {
		code: source + mutateHarness(problem, grading.argIndex),
		entry: GRADE_ENTRY,
		tests: problem.tests,
		limits
	}
}
