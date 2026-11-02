import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Script } from 'node:vm'
import {
	BUILTIN_CALL_ALLOWLIST,
	FEATURE_LIMITS,
	analysisError,
	astResultSchema,
	codeFeaturesSchema,
	featuresForWrite,
	featuresFromAstResult,
	markerFromAstResult,
	parseStoredCodeFeatures,
	storedCodeFeaturesSchema,
	unanalyzableMarkerSchema,
	type AstResult,
	type CodeFeatures
} from './code-features'
import { workerRequestSchema, workerResponseSchema } from './contract'
import { buildWorkerSource } from './worker-source'

const FEATURES: CodeFeatures = {
	v: 1,
	loops: { for: 2, while: 0, maxDepth: 2 },
	comprehensions: 0,
	branches: 1,
	returns: 2,
	defs: 1,
	recursion: false,
	usesDict: false,
	usesSet: false,
	usesSorted: false,
	builtinCalls: ['len', 'range'],
	nodeCount: 61,
	lineCount: 6
}

test('a well-formed CodeFeatures value round-trips through the schema unchanged', () => {
	assert.deepEqual(codeFeaturesSchema.parse(FEATURES), FEATURES)
})

test('the schema is strict: unknown keys (e.g. identifiers) are rejected, never stored', () => {
	assert.equal(
		codeFeaturesSchema.safeParse({ ...FEATURES, functionName: 'two_sum' }).success,
		false
	)
	assert.equal(
		codeFeaturesSchema.safeParse({ ...FEATURES, loops: { ...FEATURES.loops, vars: ['i'] } })
			.success,
		false
	)
})

test('counts are bounded integers', () => {
	const max = FEATURE_LIMITS.maxCount
	assert.equal(codeFeaturesSchema.safeParse({ ...FEATURES, nodeCount: max }).success, true)
	for (const bad of [-1, max + 1, 1.5, Number.NaN, Infinity]) {
		assert.equal(
			codeFeaturesSchema.safeParse({ ...FEATURES, nodeCount: bad }).success,
			false,
			`${bad}`
		)
		assert.equal(
			codeFeaturesSchema.safeParse({ ...FEATURES, loops: { ...FEATURES.loops, for: bad } }).success,
			false,
			`${bad}`
		)
	}
})

test('builtinCalls: only allow-listed names, sorted, unique and bounded', () => {
	const ok = (builtinCalls: unknown) =>
		codeFeaturesSchema.safeParse({ ...FEATURES, builtinCalls }).success
	assert.equal(ok([]), true)
	assert.equal(ok([...BUILTIN_CALL_ALLOWLIST]), true)
	assert.equal(ok(['print']), false, 'not on the allow-list')
	assert.equal(ok(['range', 'len']), false, 'unsorted')
	assert.equal(ok(['len', 'len']), false, 'duplicate')
	assert.equal(ok([...BUILTIN_CALL_ALLOWLIST, 'len']), false, 'too many')
	assert.deepEqual([...BUILTIN_CALL_ALLOWLIST], [...BUILTIN_CALL_ALLOWLIST].sort())
	assert.equal(new Set(BUILTIN_CALL_ALLOWLIST).size, BUILTIN_CALL_ALLOWLIST.length)
})

test('the version is pinned: another version does not parse as v1', () => {
	assert.equal(codeFeaturesSchema.safeParse({ ...FEATURES, v: 2 }).success, false)
	assert.equal(codeFeaturesSchema.safeParse({ ...FEATURES, v: undefined }).success, false)
})

test('historical attempts: null, missing and corrupt stored values read as "no features"', () => {
	assert.equal(parseStoredCodeFeatures(null), null)
	assert.equal(parseStoredCodeFeatures(undefined), null)
	assert.equal(parseStoredCodeFeatures({}), null)
	assert.equal(parseStoredCodeFeatures('{"v":1}'), null)
	assert.equal(parseStoredCodeFeatures([]), null)
	assert.equal(parseStoredCodeFeatures({ ...FEATURES, v: 99 }), null)
	assert.equal(parseStoredCodeFeatures({ ...FEATURES, loops: null }), null)
	assert.deepEqual(parseStoredCodeFeatures(FEATURES), FEATURES)
	// Jsonb returns keys in its own order; reading normalises to the schema's.
	const reordered = Object.fromEntries(Object.entries(FEATURES).reverse())
	assert.deepEqual(Object.keys(parseStoredCodeFeatures(reordered) ?? {}), Object.keys(FEATURES))
})

test('ast results: ok, syntax_error and analysis_error are the only outcomes', () => {
	const ok: AstResult = { status: 'ok', features: FEATURES }
	const syntax: AstResult = {
		status: 'syntax_error',
		syntaxError: { message: 'invalid syntax', line: 1, column: 0 }
	}
	const failed: AstResult = {
		status: 'analysis_error',
		message: 'source too large to analyze',
		permanent: true
	}
	for (const result of [ok, syntax, failed]) {
		assert.deepEqual(astResultSchema.parse(result), result)
	}
	assert.equal(astResultSchema.safeParse({ status: 'ok' }).success, false)
	assert.equal(astResultSchema.safeParse({ status: 'timeout' }).success, false)
	assert.equal(
		astResultSchema.safeParse({ status: 'analysis_error', message: 'x'.repeat(201) }).success,
		false
	)
	assert.equal(featuresFromAstResult(ok), FEATURES)
	assert.equal(featuresFromAstResult(syntax), null)
	assert.equal(featuresFromAstResult(failed), null)
})

test('analysis_error is retryable unless marked permanent (older/lenient payloads parse)', () => {
	const lenient = astResultSchema.parse({ status: 'analysis_error', message: 'wasm trap' })
	assert.deepEqual(lenient, { status: 'analysis_error', message: 'wasm trap', permanent: false })
	assert.equal(analysisError('analysis timed out').status, 'analysis_error')
	assert.deepEqual(analysisError('x'.repeat(500), true), {
		status: 'analysis_error',
		message: 'x'.repeat(200),
		permanent: true
	})
})

test('markers: only FINAL failures are recorded; success and retryable failures are not', () => {
	assert.deepEqual(
		markerFromAstResult({
			status: 'syntax_error',
			syntaxError: { message: 'invalid syntax', line: 1, column: 0 }
		}),
		{ v: 1, unanalyzable: 'syntax_error' }
	)
	assert.deepEqual(markerFromAstResult(analysisError('source too large to analyze', true)), {
		v: 1,
		unanalyzable: 'not_analyzable'
	})
	assert.equal(markerFromAstResult(analysisError('analysis timed out')), null)
	assert.equal(markerFromAstResult(analysisError('wasm trap', false)), null)
	assert.equal(markerFromAstResult({ status: 'ok', features: FEATURES }), null)
})

test('the stored column accepts features or a marker, strictly, and nothing else', () => {
	const marker = { v: 1, unanalyzable: 'syntax_error' }
	assert.equal(storedCodeFeaturesSchema.safeParse(FEATURES).success, true)
	assert.equal(storedCodeFeaturesSchema.safeParse(marker).success, true)
	assert.equal(unanalyzableMarkerSchema.safeParse({ ...marker, extra: 'x' }).success, false)
	assert.equal(unanalyzableMarkerSchema.safeParse({ v: 1, unanalyzable: 'because' }).success, false)
	assert.equal(storedCodeFeaturesSchema.safeParse({ v: 1 }).success, false)
	assert.equal(
		storedCodeFeaturesSchema.safeParse({ ...FEATURES, source: 'def f(): pass' }).success,
		false
	)
	// A marker is "no features" to every reader.
	assert.equal(parseStoredCodeFeatures(marker), null)
})

test('featuresForWrite: valid features pass; invalid ones are dropped, never thrown or stored', () => {
	assert.deepEqual(featuresForWrite(undefined), { features: null, discarded: false })
	assert.deepEqual(featuresForWrite(FEATURES), { features: FEATURES, discarded: false })
	for (const bad of [
		null,
		{},
		'x',
		42,
		{ ...FEATURES, v: 2 },
		{ ...FEATURES, extra: 1 },
		{ ...FEATURES, nodeCount: -1 },
		{ v: 1, unanalyzable: 'syntax_error' }
	]) {
		assert.deepEqual(
			featuresForWrite(bad),
			{ features: null, discarded: true },
			JSON.stringify(bad)
		)
	}
})

test('worker protocol: ast is added next to run/trace, which keep validating as before', () => {
	assert.equal(
		workerRequestSchema.safeParse({ type: 'ast', request: { code: 'x = 1' } }).success,
		true
	)
	assert.equal(workerRequestSchema.safeParse({ type: 'ast', request: {} }).success, false)
	assert.equal(
		workerRequestSchema.safeParse({
			type: 'run',
			request: {
				code: 'def f(): return 1',
				entry: 'f',
				tests: [{ id: 't1', args: [], expected: 1 }],
				limits: { timeoutMs: 1000 }
			}
		}).success,
		true
	)
	assert.equal(
		workerRequestSchema.safeParse({
			type: 'trace',
			request: {
				code: 'x',
				entry: 'f',
				input: { args: [] },
				limits: { maxSteps: 10, timeoutMs: 1000 }
			}
		}).success,
		true
	)
	assert.equal(
		workerResponseSchema.safeParse({
			type: 'ast_result',
			result: { status: 'ok', features: FEATURES }
		}).success,
		true
	)
	assert.equal(
		workerResponseSchema.safeParse({ type: 'ast_result', result: { status: 'ok' } }).success,
		false
	)
	assert.equal(workerResponseSchema.safeParse({ type: 'status', phase: 'running' }).success, true)
	assert.equal(
		workerResponseSchema.safeParse({ type: 'trace_result', result: { status: 'timeout' } }).success,
		true
	)
})

test('the generated worker is valid JavaScript and routes run, trace and ast', () => {
	const source = buildWorkerSource('http://localhost:3000/pyodide/v0.27.7/')
	assert.doesNotThrow(() => new Script(source), 'worker source must compile')
	for (const needle of [
		"message.type !== 'trace' && message.type !== 'run' && message.type !== 'ast'",
		"message.type === 'ast'",
		"type: 'ast_result'",
		"type: 'run_result'",
		"type: 'trace_result'",
		"phase: 'loading_runtime'",
		"phase: 'running'",
		'py.runPython(RUN_PROGRAM)',
		'py.runPython(TRACE_PROGRAM)',
		'py.runPython(AST_PROGRAM)'
	]) {
		assert.ok(source.includes(needle), `worker source is missing: ${needle}`)
	}
	// The ast branch must hand the parser nothing but the source and its limits:
	// no test args, no entry point, nothing to call.
	const astBranch = source.slice(
		source.indexOf("message.type === 'ast'"),
		source.indexOf('else if')
	)
	assert.ok(!astBranch.includes('request.entry'))
	assert.ok(!astBranch.includes('request.tests'))
})

test('the worker answers an ast request with a validated failure when analysis throws', async () => {
	// Drive the real worker source in a stub self/Pyodide: runPython throws.
	const source = buildWorkerSource('http://localhost:3000/pyodide/v0.27.7/')
	const posted: unknown[] = []
	const self = {
		postMessage: (data: unknown) => posted.push(data),
		onmessage: null as null | ((event: { data: unknown }) => Promise<void>)
	}
	const pyodide = {
		globals: { set: () => undefined },
		runPython: () => {
			throw new Error('boom '.repeat(100))
		}
	}
	new Function('self', 'importScripts', 'loadPyodide', source)(
		self,
		() => undefined,
		async () => pyodide
	)
	await self.onmessage?.({ data: { type: 'ast', request: { code: 'x = 1' } } })
	const last = posted.at(-1)
	const parsed = workerResponseSchema.parse(last)
	assert.equal(parsed.type, 'ast_result')
	if (parsed.type === 'ast_result') {
		assert.equal(parsed.result.status, 'analysis_error')
	}
	// run/trace failures keep their original shapes.
	posted.length = 0
	await self.onmessage?.({
		data: {
			type: 'run',
			request: { code: 'x', entry: 'f', tests: [], limits: { timeoutMs: 1000 } }
		}
	})
	assert.deepEqual(
		(posted.at(-1) as { type: string; result: { status: string } }).result.status,
		'engine_error'
	)
})
