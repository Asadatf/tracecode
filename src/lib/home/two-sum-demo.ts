import type { Json, TraceResult, Value } from '@/lib/trace/contract'
import { formatValue } from '@/lib/trace/value'

// The home page's step table (specs/features/home-page.md, AC4/AC5): the buggy
// Two Sum run, built from the engine's own committed trace rather than typed
// out by hand, so the page always shows what the engine really produces.

// 1-based step the table highlights: the `if` where i and j are both 0.
export const DEMO_HIGHLIGHT_STEP = 4

const NO_VALUE = '·'

export interface DemoRow {
	step: number
	line: number
	code: string
	i: string
	j: string
	sum: string
	highlighted: boolean
}

export interface TwoSumDemo {
	call: string
	expected: string
	actual: string
	source: string[]
	input: string[]
	rows: DemoRow[]
}

// JSON the way Python prints it in the caption: `[3, 2, 4]`, not `[3,2,4]`.
function formatJson(value: Json): string {
	if (Array.isArray(value)) return `[${value.map(formatJson).join(', ')}]`
	return JSON.stringify(value)
}

function inputItems(value: Json | undefined): string[] {
	return Array.isArray(value) ? value.map(formatJson) : []
}

function intOf(value: Value | undefined): number | null {
	return value?.kind === 'int' ? value.value : null
}

function itemAt(list: Value | undefined, index: number | null): number | null {
	if (list?.kind !== 'list' || index == null) return null
	return intOf(list.items[index])
}

export function buildTwoSumDemo(
	result: TraceResult,
	test: { args: Json[]; expected: Json },
	entry: string
): TwoSumDemo {
	const { trace, actual } = result
	if (trace == null || actual == null) throw new Error('Two Sum demo needs a completed trace')

	const rows = trace.steps
		.filter((step) => step.event !== 'return')
		.map((step, position): DemoRow => {
			const i = intOf(step.locals.i)
			const j = intOf(step.locals.j)
			const left = itemAt(step.locals.nums, i)
			const right = itemAt(step.locals.nums, j)
			const number = position + 1
			return {
				step: number,
				line: step.line,
				code: (trace.source[step.line - 1] ?? '').trim(),
				i: i == null ? NO_VALUE : String(i),
				j: j == null ? NO_VALUE : String(j),
				sum: left == null || right == null ? NO_VALUE : `${left} + ${right} = ${left + right}`,
				highlighted: number === DEMO_HIGHLIGHT_STEP
			}
		})

	return {
		call: `${entry}(${test.args.map(formatJson).join(', ')})`,
		expected: formatJson(test.expected),
		actual: formatValue(actual),
		source: trace.source,
		input: inputItems(test.args[0]),
		rows
	}
}
