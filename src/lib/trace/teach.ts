import type { ProblemMeta, Trace, Value } from './contract'
import { problemMeta, type ProblemDefinition } from './problem'
import { hasNestedLoops } from './derive'
import { formatValue, intValue, listItems } from './value'
import { NOT_IN_PLACE_PREFIX } from './grading'

// Problem-specific teaching rules. A rule fires ONLY on trace + test-outcome
// evidence; otherwise the learner gets a neutral debugging question, never a
// guessed diagnosis. Each diagnosis exposes three progressive hints
// (observation → reasoning → strategy) and never hands back corrected code.
// No LLM, no network.

export interface HintLevel {
	level: 1 | 2 | 3
	kind: 'observation' | 'reasoning' | 'strategy'
	body: string
}

export type TeachingPrompt =
	| { kind: 'diagnosis'; id: string; title: string; hints: [HintLevel, HintLevel, HintLevel] }
	| { kind: 'question'; title: string; body: string }
	| null

export interface TeachingContext {
	problem: ProblemDefinition
	// The replayed test's trace (pass or fail), or null if none was captured.
	trace: Trace | null
	outcome: { passed: boolean; actual?: Value; expected: Value; errored?: boolean }
	allTestsPassed: boolean
}

interface RuleContext extends TeachingContext {
	meta: ProblemMeta
	pointerNames: string[]
	arrayVar: string | undefined
}

type Rule = (context: RuleContext) => TeachingPrompt

function hints(
	observation: string,
	reasoning: string,
	strategy: string
): [HintLevel, HintLevel, HintLevel] {
	return [
		{ level: 1, kind: 'observation', body: observation },
		{ level: 2, kind: 'reasoning', body: reasoning },
		{ level: 3, kind: 'strategy', body: strategy }
	]
}

function returnStepOf(trace: Trace | null): Trace['steps'][number] | null {
	if (trace == null) return null
	return trace.steps.find((s) => s.event === 'return') ?? null
}

function twoInts(value: Value | undefined): [number, number] | null {
	const items = listItems(value)
	if (items == null || items.length !== 2) return null
	const a = intValue(items[0])
	const b = intValue(items[1])
	return a != null && b != null ? [a, b] : null
}

function isEmptyOrNone(value: Value | undefined): boolean {
	if (value == null) return true
	if (value.kind === 'none') return true
	return (value.kind === 'list' || value.kind === 'tuple') && value.items.length === 0
}

function valueAtIndex(
	step: Trace['steps'][number],
	arrayVar: string | undefined,
	index: number
): Value | undefined {
	if (arrayVar == null) return undefined
	const items = listItems(step.locals[arrayVar])
	return items != null && index >= 0 && index < items.length ? items[index] : undefined
}

// Both index variables landed on the same position (e.g. the inner loop started
// at the outer index instead of one past it), so an element paired with itself.
const sameIndexReused: Rule = (context) => {
	if (context.outcome.passed) return null
	const step = returnStepOf(context.trace)
	const nameA = context.pointerNames[0]
	const nameB = context.pointerNames[1]
	if (step == null || nameA == null || nameB == null) return null
	const indexA = intValue(step.locals[nameA])
	const indexB = intValue(step.locals[nameB])
	if (indexA == null || indexB == null || indexA !== indexB) return null
	const returned = twoInts(context.outcome.actual)
	if (returned == null || returned[0] !== indexA || returned[1] !== indexB) return null

	const cell = valueAtIndex(step, context.arrayVar, indexA)
	const cellText =
		cell !== undefined ? ` (${context.arrayVar}[${indexA}] = ${formatValue(cell)})` : ''
	return {
		kind: 'diagnosis',
		id: 'same-index-reused',
		title: 'The same element was used twice',
		hints: hints(
			`On this test, ${nameA} and ${nameB} were both ${indexA}, so the same element${cellText} was added to itself.`,
			`A valid pair needs two different positions. Look at where the inner loop (${nameB}) begins relative to ${nameA}.`,
			`Start the inner index one position past the outer one so every pair uses two distinct elements.`
		)
	}
}

// Returned the element values rather than their positions.
const returnedValuesNotIndices: Rule = (context) => {
	if (context.outcome.passed) return null
	const step = returnStepOf(context.trace)
	const nameA = context.pointerNames[0]
	const nameB = context.pointerNames[1]
	if (step == null || nameA == null || nameB == null) return null
	const indexA = intValue(step.locals[nameA])
	const indexB = intValue(step.locals[nameB])
	if (indexA == null || indexB == null) return null
	const returned = twoInts(context.outcome.actual)
	if (returned == null) return null
	if (returned[0] === indexA && returned[1] === indexB) return null // those are indices, not values
	const valueA = intValue(valueAtIndex(step, context.arrayVar, indexA))
	const valueB = intValue(valueAtIndex(step, context.arrayVar, indexB))
	if (valueA == null || valueB == null || returned[0] !== valueA || returned[1] !== valueB)
		return null

	return {
		kind: 'diagnosis',
		id: 'returned-values-not-indices',
		title: 'Values were returned instead of indices',
		hints: hints(
			`The function returned ${formatValue(context.outcome.actual as Value)}, which are the element values at ${nameA} = ${indexA} and ${nameB} = ${indexB}, not their positions.`,
			`Re-read what the problem asks you to return, and compare it with what your return statement produces.`,
			`Return the positions ${nameA} and ${nameB} themselves rather than the values stored at them.`
		)
	}
}

// Finished without finding a pair that exists for this input.
const noSolutionFound: Rule = (context) => {
	if (context.outcome.passed || context.outcome.errored === true) return null
	if (!isEmptyOrNone(context.outcome.actual)) return null
	if (twoInts(context.outcome.expected) == null) return null

	return {
		kind: 'diagnosis',
		id: 'no-solution-found',
		title: 'No pair was found',
		hints: hints(
			`The function finished and returned ${formatValue(context.outcome.actual ?? { kind: 'none' })}, but a valid pair exists for this test.`,
			`Which combinations did the loops actually check? Replay the test and watch the index variables.`,
			`Make sure every combination of two different positions is considered before giving up.`
		)
	}
}

// Correct, but brute-force: all tests pass with nested loops.
const optimiseAfterCorrect: Rule = (context) => {
	if (!context.allTestsPassed) return null
	if (context.trace == null || !hasNestedLoops(context.trace.source)) return null

	return {
		kind: 'diagnosis',
		id: 'optimise-nested-loops',
		title: 'A faster approach is possible',
		hints: hints(
			`All tests pass using nested loops, which checks roughly every pair, about O(n²) time.`,
			`Could you avoid re-examining pairs by remembering the numbers you have already seen?`,
			`For each number, check for its complement (target − number) in a hash map of earlier values to reach O(n).`
		)
	}
}

// ── Contains Duplicate ───────────────────────────────────────────────────────

// Returned something other than a boolean.
const cdNotBoolean: Rule = (context) => {
	if (context.outcome.passed || context.outcome.errored === true) return null
	const actual = context.outcome.actual
	if (actual == null || actual.kind === 'bool') return null
	return {
		kind: 'diagnosis',
		id: 'not-a-boolean',
		title: 'The return value is not a boolean',
		hints: hints(
			`The function returned ${formatValue(actual)}, but this problem expects True or False.`,
			`Re-read what the problem asks you to return, and compare it with what your return statement produces.`,
			`Return a Python boolean: True as soon as a repeat is found, otherwise False.`
		)
	}
}

// Said there was no duplicate when one exists, or reported one when there isn't.
const cdWrongVerdict: Rule = (context) => {
	if (context.outcome.passed || context.outcome.errored === true) return null
	const actual = context.outcome.actual
	const expected = context.outcome.expected
	if (actual?.kind !== 'bool' || expected.kind !== 'bool' || actual.value === expected.value)
		return null
	if (actual.value === false) {
		return {
			kind: 'diagnosis',
			id: 'missed-duplicate',
			title: 'A repeated value was missed',
			hints: hints(
				`The function returned False, but this input contains a value that appears more than once.`,
				`Replay the run and watch the comparisons. Is every earlier value still being checked against the current one?`,
				`Remember the values you have already seen (for example in a set) and return True as soon as one repeats.`
			)
		}
	}
	return {
		kind: 'diagnosis',
		id: 'false-duplicate',
		title: 'A duplicate was reported where there is none',
		hints: hints(
			`The function returned True, but every value in this input is distinct.`,
			`Replay the run: is a value being compared with itself, or an index reused?`,
			`Only compare two different positions, and only report True for genuinely repeated values.`
		)
	}
}

// Correct, but brute-force: all tests pass with nested loops.
const cdOptimise: Rule = (context) => {
	if (!context.allTestsPassed) return null
	if (context.trace == null || !hasNestedLoops(context.trace.source)) return null
	return {
		kind: 'diagnosis',
		id: 'optimise-nested-loops',
		title: 'A faster approach is possible',
		hints: hints(
			`All tests pass using nested loops, which compares roughly every pair, about O(n²) time.`,
			`Could you decide whether a value has been seen before without re-scanning the whole array each time?`,
			`Keep a set of values seen while scanning once, for average O(n) time.`
		)
	}
}

// ── Shared evidence helpers for the later problems ───────────────────────────

// The entry function's arguments as the engine saw them on entry: the locals of
// the first learner call step (parameters are the only locals at that point).
function entryLocals(trace: Trace | null): Record<string, Value> | null {
	if (trace == null) return null
	return trace.steps.find((s) => s.event === 'call' && s.depth === 0)?.locals ?? null
}

function strValue(value: Value | undefined): string | null {
	return value?.kind === 'str' ? value.value : null
}

function listInts(value: Value | undefined): number[] | null {
	const items = listItems(value)
	if (items == null) return null
	const ints = items.map(intValue)
	return ints.every((n): n is number => n != null) ? ints : null
}

function failedBoolVerdict(context: RuleContext): { actual: boolean; expected: boolean } | null {
	if (context.outcome.passed || context.outcome.errored === true) return null
	const { actual, expected } = context.outcome
	if (actual?.kind !== 'bool' || expected.kind !== 'bool' || actual.value === expected.value)
		return null
	return { actual: actual.value, expected: expected.value }
}

// Shared by the boolean-returning problems.
const notBoolean: Rule = (context) => {
	if (context.outcome.passed || context.outcome.errored === true) return null
	const actual = context.outcome.actual
	if (actual == null || actual.kind === 'bool') return null
	return {
		kind: 'diagnosis',
		id: 'not-a-boolean',
		title: 'The return value is not a boolean',
		hints: hints(
			`The function returned ${formatValue(actual)}, but this problem expects True or False.`,
			`Re-read what the problem asks you to return, and compare it with what your return statement produces.`,
			`Return a Python boolean (True or False) on every path through the function.`
		)
	}
}

// ── Valid Anagram ────────────────────────────────────────────────────────────

const anagramLengthIgnored: Rule = (context) => {
	const verdict = failedBoolVerdict(context)
	if (verdict == null || verdict.actual !== true) return null
	const locals = entryLocals(context.trace)
	const s = strValue(locals?.s)
	const t = strValue(locals?.t)
	if (s == null || t == null || s.length === t.length) return null
	return {
		kind: 'diagnosis',
		id: 'anagram-length-mismatch',
		title: 'Strings of different lengths were accepted',
		hints: hints(
			`The function returned True, but s has ${s.length} characters and t has ${t.length}.`,
			`Every letter of s must be used exactly once, so strings of different lengths can never match.`,
			`Rule out different lengths explicitly, or make sure your comparison cannot ignore the extra letters.`
		)
	}
}

const anagramCountsDiffer: Rule = (context) => {
	const verdict = failedBoolVerdict(context)
	if (verdict == null || verdict.actual !== true) return null
	const locals = entryLocals(context.trace)
	const s = strValue(locals?.s)
	const t = strValue(locals?.t)
	if (s == null || t == null || s.length !== t.length) return null
	if ([...new Set(s)].sort().join('') !== [...new Set(t)].sort().join('')) return null
	return {
		kind: 'diagnosis',
		id: 'anagram-counts-differ',
		title: 'Same letters, different counts',
		hints: hints(
			`s and t use the same set of letters and have the same length, yet the function returned True.`,
			`Having the same letters is not enough. "aab" and "abb" use the same letters. Does your code compare how many times each letter appears?`,
			`Compare per-letter counts (or compare the strings in a canonical order), not just which letters are present.`
		)
	}
}

const anagramRejectedValid: Rule = (context) => {
	const verdict = failedBoolVerdict(context)
	if (verdict == null || verdict.actual !== false) return null
	return {
		kind: 'diagnosis',
		id: 'anagram-rejected-valid',
		title: 'A valid rearrangement was rejected',
		hints: hints(
			`The function returned False, but t is a rearrangement of s.`,
			`Replay the run: at which point did your code decide the strings differ, and was that decision justified by the letter counts?`,
			`Only report False when the lengths differ or some letter's count differs; the positions of the letters must not matter.`
		)
	}
}

// ── Move Zeroes ──────────────────────────────────────────────────────────────

const mzNotInPlace: Rule = (context) => {
	if (context.outcome.passed) return null
	const actual = strValue(context.outcome.actual)
	if (actual == null || !actual.startsWith(NOT_IN_PLACE_PREFIX)) return null
	return {
		kind: 'diagnosis',
		id: 'move-zeroes-not-in-place',
		title: 'A different list was returned instead of changing nums',
		hints: hints(
			`The function handed back a different object, and the caller's nums was not what the test expects.`,
			`This problem is judged on the list that was passed in, after your function returns. A new list stays inside your function; the caller never sees it.`,
			`Write the result back into the original list (assign to its indexes or swap its elements) instead of returning a new one.`
		)
	}
}

const mzUnchanged: Rule = (context) => {
	if (context.outcome.passed || context.outcome.errored === true) return null
	const before = listInts(entryLocals(context.trace)?.nums)
	const after = listInts(context.outcome.actual)
	const expected = listInts(context.outcome.expected)
	if (before == null || after == null || expected == null) return null
	if (before.join() !== after.join() || before.join() === expected.join()) return null
	return {
		kind: 'diagnosis',
		id: 'move-zeroes-unchanged',
		title: 'nums was not changed',
		hints: hints(
			`After the call, nums is exactly as it was passed in, but the test expects the zeros at the end.`,
			`Assigning to the name nums, or building a new list, changes nothing the caller can see. Only changes to the list object itself are visible.`,
			`Modify the elements of the original list in place.`
		)
	}
}

const mzOrderLost: Rule = (context) => {
	if (context.outcome.passed || context.outcome.errored === true) return null
	const after = listInts(context.outcome.actual)
	const expected = listInts(context.outcome.expected)
	if (after == null || expected == null || after.length !== expected.length) return null
	if ([...after].sort((a, b) => a - b).join() !== [...expected].sort((a, b) => a - b).join())
		return null
	const nonZero = (list: number[]) => list.filter((x) => x !== 0).join()
	if (nonZero(after) === nonZero(expected)) return null
	return {
		kind: 'diagnosis',
		id: 'move-zeroes-order-lost',
		title: 'The non-zero values changed order',
		hints: hints(
			`nums holds the right values, but the non-zero ones are no longer in their original order.`,
			`Sorting, or swapping a zero with the last element, can move non-zero values past each other.`,
			`Move values in a way that never lets two non-zero values swap relative positions.`
		)
	}
}

// ── Binary Search ────────────────────────────────────────────────────────────

const bsMissed: Rule = (context) => {
	if (context.outcome.passed || context.outcome.errored === true) return null
	const actual = intValue(context.outcome.actual)
	const expected = intValue(context.outcome.expected)
	if (actual !== -1 || expected == null || expected < 0) return null
	return {
		kind: 'diagnosis',
		id: 'search-missed-target',
		title: 'The target was present but not found',
		hints: hints(
			`The function returned -1, but the target is in nums at index ${expected}.`,
			`Replay the test and note the last positions your code examined. Did it stop before reaching ${expected}, or step past it?`,
			`Check where your search range begins and ends, and whether the loop condition lets the last candidate position be examined.`
		)
	}
}

const bsFalseHit: Rule = (context) => {
	if (context.outcome.passed || context.outcome.errored === true) return null
	const actual = intValue(context.outcome.actual)
	const expected = intValue(context.outcome.expected)
	if (expected !== -1 || actual == null || actual < 0) return null
	return {
		kind: 'diagnosis',
		id: 'search-false-hit',
		title: 'A position was returned for a missing target',
		hints: hints(
			`The function returned ${actual}, but the target does not appear in nums.`,
			`Is the value at index ${actual} really equal to the target, or did the code return when it merely got close?`,
			`Return an index only after confirming nums[index] equals the target; otherwise return -1.`
		)
	}
}

const bsValueNotIndex: Rule = (context) => {
	if (context.outcome.passed || context.outcome.errored === true) return null
	const actual = intValue(context.outcome.actual)
	const expected = intValue(context.outcome.expected)
	const locals = entryLocals(context.trace)
	const target = intValue(locals?.target)
	if (actual == null || expected == null || expected < 0 || target == null) return null
	if (actual !== target || actual === expected) return null
	return {
		kind: 'diagnosis',
		id: 'search-value-not-index',
		title: 'The value was returned instead of its index',
		hints: hints(
			`The function returned ${actual}, which is the target itself, not its position (${expected}).`,
			`Re-read what the problem asks you to return, and compare it with what your return statement produces.`,
			`Return the index where the match was found, not the matching value.`
		)
	}
}

// ── Valid Parentheses ────────────────────────────────────────────────────────

const OPENERS = '([{'
const CLOSERS = ')]}'

const vpAcceptedInvalid: Rule = (context) => {
	const verdict = failedBoolVerdict(context)
	if (verdict == null || verdict.actual !== true) return null
	const s = strValue(entryLocals(context.trace)?.s)
	if (s == null) return null
	const opens = [...s].filter((c) => OPENERS.includes(c)).length
	const closes = [...s].filter((c) => CLOSERS.includes(c)).length
	const body =
		opens !== closes
			? `This input has ${opens} opening and ${closes} closing brackets, so some bracket is never matched.`
			: `This input has as many openers as closers, so the problem is in the order or the kinds.`
	return {
		kind: 'diagnosis',
		id: 'parens-accepted-invalid',
		title: 'An invalid string was accepted',
		hints: hints(
			`The function returned True, but the brackets in this input are not valid. ${body}`,
			`Valid means every closer matches the most recent opener still open, with the same kind. What does your code do when the order or kind is wrong, or when openers are left over at the end?`,
			`Check each closer against the latest unmatched opener, and only return True once nothing is left unmatched.`
		)
	}
}

const vpRejectedValid: Rule = (context) => {
	const verdict = failedBoolVerdict(context)
	if (verdict == null || verdict.actual !== false) return null
	return {
		kind: 'diagnosis',
		id: 'parens-rejected-valid',
		title: 'A valid string was rejected',
		hints: hints(
			`The function returned False, but every bracket in this input is closed by the right kind, in the right order.`,
			`Replay the run and watch where the decision to return False happens. Is it triggered by a bracket that actually has a partner?`,
			`Only return False for a closer with nothing open, a closer of the wrong kind, or openers left over at the end.`
		)
	}
}

const vpClosedWithNothingOpen: Rule = (context) => {
	if (context.outcome.passed || context.trace == null) return null
	const failure = context.trace.steps.find(
		(s) =>
			s.event === 'exception' &&
			s.exception?.type === 'IndexError' &&
			s.exception.message.includes('pop')
	)
	if (failure == null) return null
	return {
		kind: 'diagnosis',
		id: 'parens-pop-empty',
		title: 'A closing bracket arrived with nothing open',
		hints: hints(
			`The run crashed removing from an empty collection, on a string that closes a bracket nobody opened.`,
			`A string like ")" starts with a closer. What should your code decide when there is no opener to match?`,
			`Before taking the latest opener, check that there is one; if not, the string is invalid.`
		)
	}
}

const TEACHING_RULES: Record<string, Rule[]> = {
	'two-sum': [sameIndexReused, returnedValuesNotIndices, noSolutionFound, optimiseAfterCorrect],
	'contains-duplicate': [cdNotBoolean, cdWrongVerdict, cdOptimise],
	// The later problems carry no AST-based "optimise" rule: a passing solution is
	// never labelled slow from loop counts. Their post-solve exercise is the
	// problem's own `optimization` (optimizationPrompt below).
	'valid-anagram': [notBoolean, anagramLengthIgnored, anagramCountsDiffer, anagramRejectedValid],
	'move-zeroes': [mzNotInPlace, mzUnchanged, mzOrderLost],
	'binary-search': [bsMissed, bsFalseHit, bsValueNotIndex],
	'valid-parentheses': [notBoolean, vpClosedWithNothingOpen, vpAcceptedInvalid, vpRejectedValid]
}

function neutralQuestion(context: RuleContext): TeachingPrompt {
	const [nameA, nameB] = context.pointerNames
	const body =
		nameA != null && nameB != null
			? `Step through this failing test: when it returns, are ${nameA} and ${nameB} where you expect, and do they point at two different elements?`
			: `Step through this failing test and watch how each variable changes up to the moment it returns.`
	return { kind: 'question', title: 'Investigate the failure', body }
}

// The contextual prompt for a replayed test, or null when there is nothing
// evidence-based to say (e.g. a passing solution that is already efficient).
export function teach(context: TeachingContext): TeachingPrompt {
	const meta = problemMeta(context.problem)
	const ruleContext: RuleContext = {
		...context,
		meta,
		pointerNames: (meta.pointerVars ?? []).map((pair) => pair[0]),
		arrayVar: meta.arrayVar
	}
	for (const rule of TEACHING_RULES[context.problem.slug] ?? []) {
		const prompt = rule(ruleContext)
		if (prompt != null) return prompt
	}
	if (!context.outcome.passed) return specHints(context.problem) ?? neutralQuestion(ruleContext)
	return null
}

// Last resort for a failure no evidence-based rule explained: the problem's own
// understand-the-specification ladder, when it has one.
function specHints(problem: ProblemDefinition): TeachingPrompt {
	if (problem.correctnessHints == null) return null
	const [observation, reasoning, strategy] = problem.correctnessHints
	return {
		kind: 'diagnosis',
		id: `${problem.slug}-spec`,
		title: 'Re-read the specification',
		hints: hints(observation, reasoning, strategy)
	}
}

// Stage B: the optional exercise offered once every official test has passed.
// Static per problem — it asserts nothing about the learner's own solution.
// Reuses the diagnosis shape so the panel and `hint_revealed` recording
// (`optimise-<slug>:L<n>`) work unchanged.
export function optimizationPrompt(problem: ProblemDefinition): TeachingPrompt {
	const optimization = problem.optimization
	if (optimization == null) return null
	const [observation, reasoning, strategy] = optimization.hints
	return {
		kind: 'diagnosis',
		id: `optimise-${problem.slug}`,
		title: optimization.title,
		hints: hints(observation, reasoning, strategy)
	}
}
