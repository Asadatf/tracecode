import type { ProblemMeta, StepEvent, StepView, Trace, Value } from './contract'
import type { ChangedVar } from './derive'
import { deriveChanges, deriveView } from './derive'
import { formatValue, listItems } from './value'

// Deterministic, evidence-based narration of what the learner's code ACTUALLY
// did. Every sentence is grounded in a trace fact — a recorded value change, a
// pointer position, a return value, a raised exception — or quotes the source
// line verbatim. It never claims a branch was taken, invents a comparison
// result, or guesses intent.

export interface StepExplanation {
	// The original trace step index, so UI history stays linked to the trace.
	index: number
	line: number
	event: StepEvent
	title: string
	body: string
}

function joinList(parts: string[]): string {
	if (parts.length <= 1) return parts[0] ?? ''
	if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function describeChanges(changes: ChangedVar[]): string {
	return changes
		.map((c) =>
			c.from === undefined
				? `${c.name} is now ${formatValue(c.to)}`
				: `${c.name} changed from ${formatValue(c.from)} to ${formatValue(c.to)}`
		)
		.join('; ')
}

// Pointers that share one index (overlap), with the value at that index if known.
function describeOverlap(view: StepView, locals: Record<string, Value>): string | null {
	const byIndex = new Map<number, { names: string[]; list: string }>()
	for (const pointer of view.pointers) {
		const group = byIndex.get(pointer.index) ?? { names: [], list: pointer.list }
		group.names.push(pointer.name)
		byIndex.set(pointer.index, group)
	}
	for (const [index, group] of byIndex) {
		if (group.names.length < 2) continue
		const items = listItems(locals[group.list])
		const cell = items != null && index >= 0 && index < items.length ? items[index] : undefined
		const lead =
			group.names.length === 2
				? `Both ${group.names[0]} and ${group.names[1]}`
				: joinList(group.names)
		const where = cell !== undefined ? `, where the value is ${formatValue(cell)}` : ''
		return `${lead} reference index ${index}${where}.`
	}
	return null
}

function conditionText(trimmed: string): string | null {
	const match = /^(if|elif|while)\b(.*)$/.exec(trimmed)
	if (match == null) return null
	return (match[2] ?? '').replace(/:\s*$/, '').trim()
}

function explainLine(
	step: Trace['steps'][number],
	changes: ChangedVar[],
	view: StepView,
	source: string[]
): {
	title: string
	body: string
} {
	if (changes.length > 0) return { title: 'Update', body: `${describeChanges(changes)}.` }

	const overlap = describeOverlap(view, step.locals)
	if (overlap != null) return { title: 'Pointers', body: overlap }

	if (view.pointers.length >= 2) {
		const parts = view.pointers.map((p) => `${p.name} references index ${p.index}`)
		return { title: 'Pointers', body: `${joinList(parts)}.` }
	}

	const headerLoop = view.loops.find((loop) => loop.line === step.line)
	if (headerLoop != null) {
		const subject =
			headerLoop.variable != null ? `the loop over ${headerLoop.variable}` : 'the loop'
		const body =
			headerLoop.iteration === 1
				? `${subject} started.`
				: `${subject} advanced to iteration ${headerLoop.iteration}.`
		return { title: 'Loop', body: body.charAt(0).toUpperCase() + body.slice(1) }
	}

	const trimmed = (source[step.line - 1] ?? '').trim()
	const condition = conditionText(trimmed)
	if (condition != null && condition !== '')
		return { title: 'Condition', body: `Evaluating the condition \`${condition}\`.` }
	return { title: 'Statement', body: `Running \`${trimmed}\`.` }
}

export function explainStep(input: {
	step: Trace['steps'][number]
	changes: ChangedVar[]
	view: StepView
	source: string[]
	meta: ProblemMeta
}): { title: string; body: string } {
	const { step, changes, view, source, meta } = input

	if (step.event === 'call') {
		const parts = meta.params.flatMap((p) => {
			const value = step.locals[p.name]
			return value != null ? [`${p.name} = ${formatValue(value)}`] : []
		})
		const body =
			parts.length > 0
				? `${step.func} was called with ${joinList(parts)}.`
				: `${step.func} was called.`
		return { title: 'Call', body }
	}

	if (step.event === 'return') {
		const body =
			step.returnValue != null
				? `The function returned ${formatValue(step.returnValue)}.`
				: 'The function returned.'
		return { title: 'Return', body }
	}

	if (step.event === 'exception' && step.exception != null) {
		const suffix = step.exception.message !== '' ? `: ${step.exception.message}` : ''
		return { title: 'Exception', body: `A ${step.exception.type} was raised${suffix}.` }
	}

	return explainLine(step, changes, view, source)
}

// The full execution history: one explanation per step, linked to its index.
export function explainTrace(trace: Trace, meta: ProblemMeta): StepExplanation[] {
	const changesByStep = deriveChanges(trace)
	const views = deriveView(trace, meta)
	const emptyView: StepView = { changed: [], loops: [], pointers: [] }
	return trace.steps.map((step, i) => {
		const { title, body } = explainStep({
			step,
			changes: changesByStep[i] ?? [],
			view: views[i] ?? emptyView,
			source: trace.source,
			meta
		})
		return { index: step.index, line: step.line, event: step.event, title, body }
	})
}
