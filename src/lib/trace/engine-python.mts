import { spawnSync } from 'node:child_process'
import { PYODIDE_VERSION, RUN_PROGRAM, TRACE_PROGRAM } from './trace-program'
import { VALUE_LIMITS, runResultSchema, traceResultSchema } from './contract'
import type { Json, RunRequest, RunResult, TraceResult } from './contract'

// Test support: executes the engine's REAL Python programs (RUN_PROGRAM and
// TRACE_PROGRAM, the very strings the worker runs) under the local CPython, with
// the request delivered the way the worker delivers it — a REQUEST_JSON global.
// Pyodide is CPython compiled to WebAssembly, so semantics match; the real
// Pyodide path is covered separately (pyodide-engine.test.mts, e2e). Not
// production code — only *.test.mts import it.

export const PYTHON = process.env.TRACECODE_PYTHON ?? 'python3'

function runProgram(program: string, request: Record<string, unknown>): unknown {
	// The programs end with a bare `json.dumps(result)` expression, which
	// runPython returns; here it is printed instead.
	const driver = [
		'import sys',
		'REQUEST_JSON = sys.stdin.read()',
		program.replace(/json\.dumps\(result\)\s*$/, 'print(json.dumps(result))')
	].join('\n')
	const out = spawnSync(PYTHON, ['-I', '-c', driver], {
		input: JSON.stringify({ ...VALUE_LIMITS, ...request }),
		encoding: 'utf8',
		maxBuffer: 1 << 28,
		timeout: 60_000
	})
	if (out.status !== 0) throw new Error(`python failed: ${out.stderr}`)
	return JSON.parse(out.stdout)
}

export function runInPython(request: RunRequest): RunResult {
	return runResultSchema.parse(
		runProgram(RUN_PROGRAM, { source: request.code, entry: request.entry, tests: request.tests })
	)
}

export function traceInPython(
	source: string,
	entry: string,
	args: Json[],
	maxSteps = 2000
): TraceResult {
	return traceResultSchema.parse(runProgram(TRACE_PROGRAM, { source, entry, args, maxSteps }))
}

export function pythonAvailable(): boolean {
	return spawnSync(PYTHON, ['-I', '-c', 'pass']).status === 0
}

// ── Real Pyodide (the engine's actual runtime), booted once per test process ──
// The same programs and the same REQUEST_JSON hand-off the worker uses.

interface PyodideLike {
	globals: { set(name: string, value: string): void }
	runPython(code: string): string
}

let pyodidePromise: Promise<PyodideLike> | null = null

function bootPyodide(): Promise<PyodideLike> {
	pyodidePromise ??= import('pyodide').then(
		({ loadPyodide }) =>
			loadPyodide({
				indexURL: new URL(`../../../public/pyodide/v${PYODIDE_VERSION}/`, import.meta.url).pathname
			}) as Promise<PyodideLike>
	)
	return pyodidePromise
}

async function runInPyodideProgram(program: string, request: Record<string, unknown>) {
	const py = await bootPyodide()
	py.globals.set('REQUEST_JSON', JSON.stringify({ ...VALUE_LIMITS, ...request }))
	return JSON.parse(py.runPython(program)) as unknown
}

export async function runInPyodide(request: RunRequest): Promise<RunResult> {
	return runResultSchema.parse(
		await runInPyodideProgram(RUN_PROGRAM, {
			source: request.code,
			entry: request.entry,
			tests: request.tests
		})
	)
}

export async function traceInPyodide(
	source: string,
	entry: string,
	args: Json[],
	maxSteps = 2000
): Promise<TraceResult> {
	return traceResultSchema.parse(
		await runInPyodideProgram(TRACE_PROGRAM, { source, entry, args, maxSteps })
	)
}
