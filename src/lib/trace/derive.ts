import type { LoopState, Pointer, ProblemMeta, StepView, Trace, Value } from './contract'
import { intValue, valueEquals } from './value'

// Deterministic interpretation of an engine Trace into visualiser-ready data.
// PURE: no Pyodide, no narration, no guessing — every output is a fact derived
// from the trace plus problem metadata. The engine emits facts only
// (contract.ts); changed vars, loop state and pointers are computed here.
//
// sys.settrace semantics the callers rely on: a `line` event fires BEFORE that
// line runs, so a value assigned by a line first appears in the NEXT step.

// A variable whose value differs from the previous step in the same frame.
// `from` is absent when the variable is newly introduced in this frame.
export interface ChangedVar {
	name: string
	from?: Value
	to: Value
}

export interface LoopHeader {
	line: number
	indent: number
	kind: 'for' | 'while'
	variable?: string
	body: Set<number>
}

function peek<T>(stack: T[]): T | undefined {
	return stack[stack.length - 1]
}

function indentOf(line: string): number {
	const leading = /^[ \t]*/.exec(line)?.[0] ?? ''
	let width = 0
	for (const char of leading) width += char === '\t' ? 4 : 1
	return width
}

// Loop headers and their body line numbers, found by indentation. Static source
// analysis only decides SCOPE; iteration counts come from trace evidence below.
export function parseLoops(source: string[]): LoopHeader[] {
	const headers: LoopHeader[] = []
	for (let i = 0; i < source.length; i++) {
		const raw = source[i] as string
		const trimmed = raw.trim()
		const match = /^(for|while)\b/.exec(trimmed)
		if (match == null) continue
		const indent = indentOf(raw)
		const variableMatch = match[1] === 'for' ? /^for\s+([A-Za-z_]\w*)/.exec(trimmed) : null
		const body = new Set<number>()
		for (let j = i + 1; j < source.length; j++) {
			const bodyLine = source[j] as string
			if (bodyLine.trim() === '') continue
			if (indentOf(bodyLine) > indent) body.add(j + 1)
			else break
		}
		headers.push({
			line: i + 1,
			indent,
			kind: match[1] as 'for' | 'while',
			variable: variableMatch?.[1],
			body
		})
	}
	return headers
}

// True when at least one loop body contains another loop header (nested loops).
export function hasNestedLoops(source: string[]): boolean {
	const headers = parseLoops(source)
	return headers.some((outer) =>
		headers.some((inner) => inner !== outer && outer.body.has(inner.line))
	)
}

// Loops whose scope (header line or body) contains `line`, outermost first.
function activeLoops(line: number, headers: LoopHeader[]): LoopHeader[] {
	return headers
		.filter((h) => h.line === line || h.body.has(line))
		.sort((a, b) => a.indent - b.indent || a.line - b.line)
}

interface Frame {
	depth: number
	prevLocals: Record<string, Value>
}

// Per-step changed variables, frame-aware, with previous values for narration.
export function deriveChanges(trace: Trace): ChangedVar[][] {
	const result: ChangedVar[][] = []
	const stack: Frame[] = []

	function introduced(locals: Record<string, Value>): ChangedVar[] {
		return Object.entries(locals).map(([name, to]) => ({ name, to }))
	}

	for (const step of trace.steps) {
		while (stack.length > 0) {
			const top = peek(stack)
			if (top == null || top.depth <= step.depth) break
			stack.pop()
		}

		let changes: ChangedVar[]
		if (step.event === 'call') {
			const top = peek(stack)
			if (top != null && top.depth === step.depth) stack.pop()
			changes = introduced(step.locals)
			stack.push({ depth: step.depth, prevLocals: step.locals })
		} else {
			const top = peek(stack)
			const frame = top != null && top.depth === step.depth ? top : null
			if (frame == null) {
				changes = introduced(step.locals)
				stack.push({ depth: step.depth, prevLocals: step.locals })
			} else {
				changes = []
				for (const [name, current] of Object.entries(step.locals)) {
					const previous = frame.prevLocals[name]
					if (previous === undefined) changes.push({ name, to: current })
					else if (!valueEquals(previous, current))
						changes.push({ name, from: previous, to: current })
				}
				frame.prevLocals = step.locals
			}
			if (step.event === 'return') stack.pop()
		}
		result.push(changes)
	}
	return result
}

// The full per-step StepView[]: changed names, active loop state, pointers.
// One entry per trace step, aligned to Step.index (dense, 0-based).
export function deriveView(trace: Trace, meta: ProblemMeta): StepView[] {
	const headers = parseLoops(trace.source)
	const changesByStep = deriveChanges(trace)
	const loopIteration = new Map<number, number>()
	let previousActive = new Set<number>()
	const views: StepView[] = []

	for (const [i, step] of trace.steps.entries()) {
		const active = activeLoops(step.line, headers)
		const activeLines = new Set(active.map((h) => h.line))

		for (const line of previousActive) if (!activeLines.has(line)) loopIteration.delete(line)

		if (step.event === 'line') {
			const header = headers.find((h) => h.line === step.line)
			if (header != null) loopIteration.set(header.line, (loopIteration.get(header.line) ?? 0) + 1)
		}

		const loops: LoopState[] = []
		for (const header of active) {
			const iteration = loopIteration.get(header.line)
			if (iteration !== undefined && iteration >= 1) {
				loops.push({ line: header.line, variable: header.variable, iteration })
			}
		}
		previousActive = activeLines

		const pointers: Pointer[] = []
		for (const [name, list] of meta.pointerVars ?? []) {
			const index = intValue(step.locals[name])
			if (index !== null) pointers.push({ name, list, index })
		}

		views.push({ changed: (changesByStep[i] ?? []).map((c) => c.name), loops, pointers })
	}
	return views
}
