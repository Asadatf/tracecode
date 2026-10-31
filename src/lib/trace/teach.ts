import type { ProblemMeta, Trace, Value } from './contract'
import { problemMeta, type ProblemDefinition } from './problem'
import { hasNestedLoops } from './derive'
import { formatValue, intValue, listItems } from './value'

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
			`All tests pass using nested loops, which checks roughly every pair — about O(n²) time.`,
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
			`Return a Python boolean — True as soon as a repeat is found, otherwise False.`
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
				`Replay the run and watch the comparisons — is every earlier value still being checked against the current one?`,
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
			`All tests pass using nested loops, which compares roughly every pair — about O(n²) time.`,
			`Could you decide whether a value has been seen before without re-scanning the whole array each time?`,
			`Keep a set of values seen while scanning once, for average O(n) time.`
		)
	}
}

const TEACHING_RULES: Record<string, Rule[]> = {
	'two-sum': [sameIndexReused, returnedValuesNotIndices, noSolutionFound, optimiseAfterCorrect],
	'contains-duplicate': [cdNotBoolean, cdWrongVerdict, cdOptimise]
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
	if (!context.outcome.passed) return neutralQuestion(ruleContext)
	return null
}
