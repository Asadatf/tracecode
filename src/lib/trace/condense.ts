import type { Step, Trace, Value } from './contract'

// Condensing a recorded execution trace for display (specs/features/practice-trace-condensing.md).
//
// A trace of a loop can be hundreds of near-identical steps. This module finds runs where the
// SAME sequence of events repeats and where each pass changes the same variables in the same
// way, so the replay can show a few passes and then one honest summary line. It only ever
// describes what the recorded trace establishes:
//   - the pass count is a count of real repeated step sequences (event, line, depth change);
//   - two passes are grouped only if their STATE EFFECT matches: the same variables changed, in
//     the same kind of way (a list that grew, a list changed in place, a number that changed, a
//     flag that flipped...). Same source line alone is never enough, so a pass that inserts into
//     a dict, swaps two cells, takes the other branch or changes something new always stays
//     visible on its own;
//   - exceptions and the entry function's final return are never folded;
//   - nothing is dropped from the data: every step is still in the trace and can be expanded.
// It does not guess intent, narrate, or call anything. Pure: no DOM, no engine.

export const CONDENSE = {
	// Passes shown at the start of a folded run, so the pattern is visible first.
	headPasses: 3,
	// Passes shown at the end, so the last pass before the loop ends is visible too.
	tailPasses: 1,
	// Fold only when at least this many passes would be hidden (a fold must save something).
	minHidden: 3,
	// Longest pass, in trace steps, that is looked for.
	maxPeriod: 24
} as const

export type RunNoun = 'iterations' | 'recursive calls' | 'repeats'

export interface RepeatRun {
	// Stable within one trace, by position.
	id: number
	// The steps that are folded away, inclusive. The shown passes are outside this range.
	hiddenFrom: number
	hiddenTo: number
	hiddenSteps: number
	// Passes folded away, and passes in the whole matching run (shown + folded).
	hiddenPasses: number
	totalPasses: number
	// Steps per pass.
	period: number
	noun: RunNoun
	// Source lines the pass touches, ascending.
	lines: number[]
	// Variables whose value changes on EVERY folded pass (they all share one effect).
	changedEachPass: string[]
	// Some value in the run was cut off by the recording's size bounds, so a change inside the
	// cut-off part is not part of what was compared.
	partial: boolean
}

// ---- value comparison ---------------------------------------------------------------

function valueEquals(a: Value | undefined, b: Value | undefined): boolean {
	if (a === undefined || b === undefined) return a === b
	if (a.kind !== b.kind) return false
	switch (a.kind) {
		case 'int':
		case 'float':
		case 'bool':
		case 'str':
			return a.value === (b as typeof a).value
		case 'none':
			return true
		case 'other':
			return a.repr === (b as typeof a).repr
		case 'list':
		case 'tuple': {
			const other = b as typeof a
			return (
				a.items.length === other.items.length &&
				a.items.every((item, i) => valueEquals(item, other.items[i]))
			)
		}
		case 'dict': {
			const other = b as typeof a
			return (
				a.entries.length === other.entries.length &&
				a.entries.every(
					([k, v], i) =>
						valueEquals(k, other.entries[i]?.[0]) && valueEquals(v, other.entries[i]?.[1])
				)
			)
		}
	}
}

function isTruncated(value: Value | undefined): boolean {
	if (value === undefined) return false
	if (value.kind === 'list' || value.kind === 'tuple')
		return value.truncated === true || value.items.some(isTruncated)
	if (value.kind === 'dict')
		return (
			value.truncated === true || value.entries.some(([k, v]) => isTruncated(k) || isTruncated(v))
		)
	return false
}

function size(value: Value): number | null {
	if (value.kind === 'list' || value.kind === 'tuple') return value.items.length
	if (value.kind === 'dict') return value.entries.length
	return null
}

// How a variable changed across one pass, as a coarse KIND (never the value itself).
// `directional` is for passes that cross call depths (recursion), where a number moving up or
// down is part of what the pass does.
function changeKind(
	before: Value | undefined,
	after: Value | undefined,
	directional: boolean
): string | null {
	if (before === undefined && after === undefined) return null
	if (before === undefined) return 'new'
	if (after === undefined) return 'gone'
	if (valueEquals(before, after)) return null
	if (before.kind !== after.kind) return 'type'
	if (before.kind === 'int' || before.kind === 'float') {
		const to = (after as typeof before).value
		return directional ? (to > before.value ? 'up' : 'down') : 'num'
	}
	if (before.kind === 'bool') return 'flip'
	if (before.kind === 'str') return 'str'
	const from = size(before)
	const to = size(after)
	if (from != null && to != null && from !== to)
		return `size${to - from > 0 ? '+' : ''}${to - from}`
	return 'items'
}

// The state effect of one pass: which variables changed and how. Equal strings = same effect.
function effectOf(first: Step, next: Step, directional: boolean): { key: string; names: string[] } {
	const names = new Set([...Object.keys(first.locals), ...Object.keys(next.locals)])
	const parts: string[] = []
	const changed: string[] = []
	for (const name of [...names].sort()) {
		const kind = changeKind(first.locals[name], next.locals[name], directional)
		if (kind != null) {
			parts.push(`${name}:${kind}`)
			changed.push(name)
		}
	}
	return { key: parts.join('|'), names: changed }
}

// ---- repetition detection -----------------------------------------------------------

function tokensOf(steps: readonly Step[]): string[] {
	let previous = steps[0]?.depth ?? 0
	return steps.map((step) => {
		const delta = step.depth - previous
		previous = step.depth
		return `${step.event}:${step.line}:${delta}`
	})
}

function nounFor(trace: Trace, steps: readonly Step[], start: number, period: number): RunNoun {
	const slice = steps.slice(start, start + period)
	if (slice.some((s) => s.event === 'call')) return 'recursive calls'
	if (slice.some((s, i) => i > 0 && s.depth !== slice[i - 1]!.depth)) return 'recursive calls'
	const head = (trace.source[(slice[0]?.line ?? 1) - 1] ?? '').trim()
	return /^(for|while)\b/.test(head) ? 'iterations' : 'repeats'
}

// Steps that must stay visible no matter what: an exception, and the entry function's final
// return (depth 0). Folding a pass that contains one would hide an outcome.
function isOutcomeStep(step: Step): boolean {
	return step.event === 'exception' || (step.event === 'return' && step.depth === 0)
}

export function condenseTrace(trace: Trace): RepeatRun[] {
	const steps = trace.steps
	const n = steps.length
	const tokens = tokensOf(steps)
	const runs: RepeatRun[] = []
	const need = CONDENSE.headPasses + CONDENSE.tailPasses + CONDENSE.minHidden

	let i = 0
	while (i < n) {
		let bestPeriod = 0
		let bestPasses = 0
		for (let p = 1; p <= CONDENSE.maxPeriod && i + 2 * p <= n; p += 1) {
			let k = 1
			while (i + (k + 1) * p <= n && sameWindow(tokens, i, i + k * p, p)) k += 1
			if (k >= 2 && k * p > bestPasses * bestPeriod) {
				bestPeriod = p
				bestPasses = k
			}
		}
		if (bestPasses < need) {
			i += 1
			continue
		}
		const p = bestPeriod
		// Per-pass state effect. A pass needs a step after it to measure against.
		const directional = steps
			.slice(i, i + bestPasses * p)
			.some((s, idx, all) => idx > 0 && s.depth !== all[idx - 1]!.depth)
		const effects: ({ key: string; names: string[]; partial: boolean } | null)[] = []
		for (let pass = 0; pass < bestPasses; pass += 1) {
			const first = steps[i + pass * p]
			const next = steps[i + (pass + 1) * p]
			if (first == null || next == null) {
				effects.push(null)
				continue
			}
			const effect = effectOf(first, next, directional)
			const partial = [first, next].some((s) => Object.values(s.locals).some(isTruncated))
			effects.push({ ...effect, partial })
		}
		// Group consecutive passes with an identical effect; fold inside long enough groups.
		let a = 0
		while (a < bestPasses) {
			const lead = effects[a]
			if (lead == null) {
				a += 1
				continue
			}
			let b = a
			while (b + 1 < bestPasses && effects[b + 1]?.key === lead.key) b += 1
			const count = b - a + 1
			if (count >= need) {
				const hiddenFirstPass = a + CONDENSE.headPasses
				const hiddenLastPass = b - CONDENSE.tailPasses
				const hiddenFrom = i + hiddenFirstPass * p
				const hiddenTo = i + (hiddenLastPass + 1) * p - 1
				const folded = steps.slice(hiddenFrom, hiddenTo + 1)
				const safe = !folded.some(isOutcomeStep)
				if (safe && hiddenTo >= hiddenFrom) {
					const touched = new Set(steps.slice(i + a * p, i + (b + 1) * p).map((s) => s.line))
					runs.push({
						id: runs.length,
						hiddenFrom,
						hiddenTo,
						hiddenSteps: hiddenTo - hiddenFrom + 1,
						hiddenPasses: hiddenLastPass - hiddenFirstPass + 1,
						totalPasses: count,
						period: p,
						noun: nounFor(trace, steps, i + a * p, p),
						lines: [...touched].sort((x, y) => x - y),
						changedEachPass: lead.names,
						partial: effects.slice(a, b + 1).some((e) => e?.partial === true)
					})
				}
			}
			a = b + 1
		}
		i += bestPasses * p
	}
	return runs
}

function sameWindow(tokens: readonly string[], a: number, b: number, length: number): boolean {
	for (let offset = 0; offset < length; offset += 1) {
		if (tokens[a + offset] !== tokens[b + offset]) return false
	}
	return true
}

// ---- reading the runs ---------------------------------------------------------------

export function runContaining(runs: readonly RepeatRun[], index: number): RepeatRun | undefined {
	return runs.find((run) => index >= run.hiddenFrom && index <= run.hiddenTo)
}

// The step to land on when moving one step from `from` in `direction`, skipping the steps of any
// folded (not expanded) run. Stays within the trace. `isOpen(run)` says whether a run is expanded.
export function stepFrom(
	runs: readonly RepeatRun[],
	from: number,
	direction: 1 | -1,
	total: number,
	isOpen: (run: RepeatRun) => boolean
): number {
	let next = Math.max(0, Math.min(total - 1, from + direction))
	for (;;) {
		const run = runContaining(runs, next)
		if (run == null || isOpen(run)) return next
		next = direction === 1 ? run.hiddenTo + 1 : run.hiddenFrom - 1
		if (next < 0) return 0
		if (next > total - 1) return total - 1
	}
}

// The run a step in `direction` from `from` would jump over, if any.
export function runAhead(
	runs: readonly RepeatRun[],
	from: number,
	direction: 1 | -1,
	isOpen: (run: RepeatRun) => boolean
): RepeatRun | undefined {
	const run = runContaining(runs, from + direction)
	return run != null && !isOpen(run) ? run : undefined
}

function joinNames(names: readonly string[]): string {
	if (names.length <= 1) return names[0] ?? ''
	if (names.length === 2) return `${names[0]} and ${names[1]}`
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// Words for a folded run. Only facts the comparison established: the pass count, the lines, and
// the variables that changed on every folded pass.
export function describeRun(run: RepeatRun): { summary: string; detail: string } {
	const unit = run.hiddenPasses === 1 ? run.noun.replace(/s$/, '') : run.noun
	const summary = `This pattern repeats for the next ${run.hiddenPasses} ${unit}`
	const lines =
		run.lines.length === 1
			? `Line ${run.lines[0]}`
			: `Lines ${run.lines[0]}–${run.lines[run.lines.length - 1]}`
	const changed =
		run.changedEachPass.length === 0
			? run.partial
				? 'No change is recorded in the values that were captured.'
				: 'No variable changes on these passes.'
			: `${joinNames(run.changedEachPass)} ${run.changedEachPass.length === 1 ? 'changes' : 'change'} on every pass.`
	const caveat = run.partial
		? ' Some values are cut off in the recording, so changes inside the cut-off part are not compared.'
		: ''
	return { summary, detail: `${lines} run again each time. ${changed}${caveat}` }
}

// Steps visible in the condensed outline (everything except folded runs).
export function outlineIndices(
	total: number,
	runs: readonly RepeatRun[],
	isOpen: (run: RepeatRun) => boolean
): number[] {
	const out: number[] = []
	for (let i = 0; i < total; i += 1) {
		const run = runContaining(runs, i)
		if (run == null || isOpen(run)) out.push(i)
	}
	return out
}
