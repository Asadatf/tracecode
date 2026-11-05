import { buildRunRequest } from '../trace/grading'
import type { ProblemDefinition } from '../trace/problem'
import { pythonEquals } from './judge'

// Building a grading job and judging its outputs (ADR-0007). Pure: the sandbox is
// elsewhere. The job carries the learner's code (wrapped by the same harness practice
// uses, so in-place problems are judged identically) and the hidden cases' INPUTS ONLY.

export const CASE_TIMEOUT_SECONDS = 4

export interface HiddenCaseLike {
	id: string
	args: unknown[]
	expected: unknown
}

export interface GradingJob {
	code: string
	entry: string
	cases: { id: string; args: unknown[] }[]
	caseTimeoutSeconds: number
}

export function buildGradingJob(
	problem: ProblemDefinition,
	source: string,
	cases: readonly HiddenCaseLike[]
): GradingJob {
	const request = buildRunRequest(problem, source, { timeoutMs: CASE_TIMEOUT_SECONDS * 1000 })
	return {
		code: request.code,
		entry: request.entry,
		// Inputs only. `expected` is deliberately dropped here and never serialised.
		cases: cases.map(({ id, args }) => ({ id, args })),
		caseTimeoutSeconds: CASE_TIMEOUT_SECONDS
	}
}

export interface CaseOutput {
	id: string
	ok: boolean
	actual?: unknown
	error?: string
}

export type Judgement =
	{ ok: true; testsPassed: number; testsTotal: number } | { ok: false; code: 'bad_runner_output' }

// Counts the cases whose output equals the hidden expected answer. A case that is
// missing, duplicated, errored or timed out does not pass. Output that does not cover
// the job is a GRADER failure (retryable), never a learner's score.
export function judgeOutputs(outputs: unknown, cases: readonly HiddenCaseLike[]): Judgement {
	if (!Array.isArray(outputs)) return { ok: false, code: 'bad_runner_output' }
	const byId = new Map<string, CaseOutput>()
	for (const item of outputs) {
		if (typeof item !== 'object' || item === null) return { ok: false, code: 'bad_runner_output' }
		const output = item as CaseOutput
		if (typeof output.id !== 'string' || typeof output.ok !== 'boolean') {
			return { ok: false, code: 'bad_runner_output' }
		}
		if (byId.has(output.id)) return { ok: false, code: 'bad_runner_output' }
		byId.set(output.id, output)
	}
	if (byId.size !== cases.length || cases.some((c) => !byId.has(c.id))) {
		return { ok: false, code: 'bad_runner_output' }
	}
	const testsPassed = cases.filter((c) => {
		const output = byId.get(c.id)
		return output?.ok === true && pythonEquals(output.actual, c.expected)
	}).length
	return { ok: true, testsPassed, testsTotal: cases.length }
}

export function parseRunnerStdout(stdout: string): unknown {
	const lines = stdout.split('\n').filter((line) => line.trim() !== '')
	const last = lines.at(-1)
	if (last == null) return null
	try {
		return JSON.parse(last)
	} catch {
		return null
	}
}
