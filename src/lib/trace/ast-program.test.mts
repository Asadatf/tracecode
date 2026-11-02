import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AST_PROGRAM } from './ast-program'
import {
	BUILTIN_CALL_ALLOWLIST,
	FEATURE_LIMITS,
	astResultSchema,
	codeFeaturesSchema,
	type AstResult,
	type CodeFeatures
} from './code-features'
import { containsDuplicate, twoSum } from './problems'

// M7.1 extraction, run for real: AST_PROGRAM executes under CPython (3.12 here,
// the same major as Pyodide 0.27) with the globals the worker sets, and its JSON
// is validated against the same Zod schema the main thread uses. The browser
// path through Pyodide itself is covered in e2e/trace-engine.spec.ts.

// Mirrors Pyodide's runPython: run the program, return its last expression.
const HARNESS = `
import ast as _ast, sys
program = sys.stdin.read()
g = {'REQUEST_JSON': sys.argv[1]}
tree = _ast.parse(program)
last = tree.body.pop()
exec(compile(tree, '<program>', 'exec'), g)
print(eval(compile(_ast.Expression(last.value), '<program>', 'eval'), g))
`

const python = spawnSync('python3', ['-I', '-c', 'import sys; print(sys.version_info[:2])'], {
	encoding: 'utf8'
})
const SKIP = python.status === 0 ? false : 'python3 is not available'

function request(source: unknown) {
	return JSON.stringify({
		source,
		maxSourceChars: FEATURE_LIMITS.maxSourceChars,
		maxCount: FEATURE_LIMITS.maxCount,
		builtinAllowlist: BUILTIN_CALL_ALLOWLIST
	})
}

function runProgram(requestJson: string): string {
	const out = spawnSync('python3', ['-I', '-c', HARNESS, requestJson], {
		input: AST_PROGRAM,
		encoding: 'utf8'
	})
	assert.equal(out.status, 0, out.stderr)
	return out.stdout.trim()
}

function analyze(source: unknown): AstResult {
	return astResultSchema.parse(JSON.parse(runProgram(request(source))))
}

function featuresOf(source: string): CodeFeatures {
	const result = analyze(source)
	assert.equal(result.status, 'ok', JSON.stringify(result))
	return result.status === 'ok' ? result.features : (undefined as never)
}

const NESTED_DUPLICATE = [
	'def contains_duplicate(nums):',
	'    for i in range(len(nums)):',
	'        for j in range(i + 1, len(nums)):',
	'            if nums[i] == nums[j]:',
	'                return True',
	'    return False'
].join('\n')

const SET_DUPLICATE = [
	'def contains_duplicate(nums):',
	'    seen = set()',
	'    for n in nums:',
	'        if n in seen:',
	'            return True',
	'        seen.add(n)',
	'    return False'
].join('\n')

const SORT_DUPLICATE = [
	'def contains_duplicate(nums):',
	'    nums = sorted(nums)',
	'    return any(nums[i] == nums[i + 1] for i in range(len(nums) - 1))'
].join('\n')

const BRUTE_TWO_SUM = [
	'def two_sum(nums, target):',
	'    for i in range(len(nums)):',
	'        for j in range(i + 1, len(nums)):',
	'            if nums[i] + nums[j] == target:',
	'                return [i, j]',
	'    return []'
].join('\n')

const HASHMAP_TWO_SUM = [
	'def two_sum(nums, target):',
	'    seen = {}',
	'    for i, n in enumerate(nums):',
	'        c = target - n',
	'        if c in seen:',
	'            return [seen[c], i]',
	'        seen[n] = i',
	'    return []'
].join('\n')

test(
	'Two Sum, nested loops: depth 2, two for-loops, index structures via range/len',
	{ skip: SKIP },
	() => {
		const f = featuresOf(BRUTE_TWO_SUM)
		assert.deepEqual(f.loops, { for: 2, while: 0, maxDepth: 2 })
		assert.equal(f.branches, 1)
		assert.equal(f.returns, 2)
		assert.equal(f.defs, 1)
		assert.equal(f.recursion, false)
		assert.deepEqual([f.usesDict, f.usesSet, f.usesSorted], [false, false, false])
		assert.deepEqual(f.builtinCalls, ['len', 'range'])
		assert.equal(f.lineCount, 6)
	}
)

test('Two Sum, hash map: a dict, one loop, enumerate, no nesting', { skip: SKIP }, () => {
	const f = featuresOf(HASHMAP_TWO_SUM)
	assert.deepEqual(f.loops, { for: 1, while: 0, maxDepth: 1 })
	assert.equal(f.usesDict, true)
	assert.equal(f.usesSet, false)
	assert.deepEqual(f.builtinCalls, ['enumerate'])
	assert.equal(f.lineCount, 8)
})

test('Two Sum, the buggy self-pairing fixture parses like the brute one', { skip: SKIP }, () => {
	const buggy = featuresOf(BRUTE_TWO_SUM.replace('range(i + 1, len(nums))', 'range(len(nums))'))
	assert.deepEqual(buggy.loops, { for: 2, while: 0, maxDepth: 2 })
})

test('Contains Duplicate: nested loops vs a set vs sorted + generator', { skip: SKIP }, () => {
	const nested = featuresOf(NESTED_DUPLICATE)
	assert.equal(nested.loops.maxDepth, 2)
	assert.equal(nested.usesSet, false)

	const set = featuresOf(SET_DUPLICATE)
	assert.deepEqual(set.loops, { for: 1, while: 0, maxDepth: 1 })
	assert.equal(set.usesSet, true)
	assert.deepEqual(set.builtinCalls, ['set'])

	const sorted = featuresOf(SORT_DUPLICATE)
	assert.equal(sorted.usesSorted, true)
	assert.equal(sorted.comprehensions, 1)
	assert.deepEqual(sorted.loops, { for: 0, while: 0, maxDepth: 0 })
	assert.deepEqual(sorted.builtinCalls, ['any', 'len', 'range', 'sorted'])
})

test('the catalog starters parse and carry no structure yet', { skip: SKIP }, () => {
	for (const problem of [twoSum, containsDuplicate]) {
		const f = featuresOf(problem.starter)
		assert.deepEqual(f.loops, { for: 0, while: 0, maxDepth: 0 }, problem.slug)
		assert.equal(f.defs, 1, problem.slug)
		assert.equal(f.returns, 1, problem.slug)
	}
})

test('while loops, loop depth through a while, and .sort()', { skip: SKIP }, () => {
	const f = featuresOf(
		[
			'def f(xs):',
			'    xs.sort()',
			'    i = 0',
			'    while i < len(xs):',
			'        for x in xs:',
			'            pass',
			'        i += 1'
		].join('\n')
	)
	assert.deepEqual(f.loops, { for: 1, while: 1, maxDepth: 2 })
	assert.equal(f.usesSorted, true)
})

test('dict and set literals, comprehensions and constructor calls', { skip: SKIP }, () => {
	assert.equal(featuresOf('x = {1: 2}').usesDict, true)
	assert.equal(featuresOf('x = {1, 2}').usesSet, true)
	assert.equal(featuresOf('x = {k: 1 for k in y}').usesDict, true)
	assert.equal(featuresOf('x = {k for k in y}').usesSet, true)
	assert.equal(featuresOf('x = Counter(y)').usesDict, true)
	assert.equal(featuresOf('x = frozenset(y)').usesSet, true)
	const comps = featuresOf(
		'a = [x for x in y]\nb = (x for x in y)\nc = {x for x in y}\nd = {x: 1 for x in y}'
	)
	assert.equal(comps.comprehensions, 4)
	assert.deepEqual(comps.loops, { for: 0, while: 0, maxDepth: 0 })
})

test(
	'recursion: a function calling itself by name, including through a nested def',
	{ skip: SKIP },
	() => {
		assert.equal(featuresOf('def f(n):\n    return 1 if n < 2 else f(n - 1)').recursion, true)
		assert.equal(
			featuresOf('def f(n):\n    def g():\n        return f(n)\n    return g()').recursion,
			true
		)
		assert.equal(featuresOf('def f(n):\n    return g(n)\ndef g(n):\n    return n').recursion, false)
		assert.equal(featuresOf('def f(n):\n    return n').recursion, false)
	}
)

test('async defs and async for count as defs and for-loops', { skip: SKIP }, () => {
	const f = featuresOf('async def f(xs):\n    async for x in xs:\n        pass')
	assert.equal(f.defs, 1)
	assert.equal(f.loops.for, 1)
})

test(
	'builtinCalls reports only allow-listed names, sorted, with no identifiers',
	{ skip: SKIP },
	() => {
		const f = featuresOf(
			'def secret_helper_name(zebra):\n    print(zebra)\n    return zip(map(abs, zebra), sorted(zebra), len(zebra))'
		)
		assert.deepEqual(f.builtinCalls, ['len', 'map', 'sorted', 'zip'])
		const serialised = JSON.stringify(f)
		assert.ok(!serialised.includes('secret_helper_name'))
		assert.ok(!serialised.includes('zebra'))
		assert.ok(!serialised.includes('print'))
	}
)

test('extraction is deterministic and always schema-valid', { skip: SKIP }, () => {
	for (const source of [BRUTE_TWO_SUM, HASHMAP_TWO_SUM, SET_DUPLICATE, SORT_DUPLICATE]) {
		const first = runProgram(request(source))
		assert.equal(runProgram(request(source)), first)
		assert.equal(codeFeaturesSchema.safeParse(JSON.parse(first).features).success, true)
	}
})

test('nodeCount equals ast.walk, so it is a plain size proxy', { skip: SKIP }, () => {
	const ref = spawnSync(
		'python3',
		['-I', '-c', 'import ast,sys; print(len(list(ast.walk(ast.parse(sys.stdin.read())))))'],
		{ input: HASHMAP_TWO_SUM, encoding: 'utf8' }
	)
	assert.equal(featuresOf(HASHMAP_TWO_SUM).nodeCount, Number(ref.stdout.trim()))
})

test('line counting: trailing newline, CRLF, blank and empty sources', { skip: SKIP }, () => {
	assert.equal(featuresOf('x = 1').lineCount, 1)
	assert.equal(featuresOf('x = 1\n').lineCount, 1)
	assert.equal(featuresOf('x = 1\r\ny = 2\r\n').lineCount, 2)
	assert.equal(featuresOf('').lineCount, 0)
	assert.equal(featuresOf('   \n\n').lineCount, 2)
})

test('empty source parses to all-zero features', { skip: SKIP }, () => {
	const f = featuresOf('')
	assert.deepEqual(f.loops, { for: 0, while: 0, maxDepth: 0 })
	assert.deepEqual([f.comprehensions, f.branches, f.returns, f.defs, f.nodeCount], [0, 0, 0, 0, 1])
	assert.deepEqual(f.builtinCalls, [])
})

test(
	'a syntax error is a validated outcome with a position, not an exception',
	{ skip: SKIP },
	() => {
		const result = analyze('def two_sum(nums, target)\n    return []')
		assert.equal(result.status, 'syntax_error')
		if (result.status === 'syntax_error') {
			assert.equal(result.syntaxError.line, 1)
			assert.ok(result.syntaxError.message.length > 0)
		}
		assert.equal(analyze('def f(:\n').status, 'syntax_error')
		assert.equal(analyze('if True:\nreturn 1').status, 'syntax_error')
		assert.equal(analyze('x = (1,\n').status, 'syntax_error')
	}
)

test('malformed input is an analysis_error or syntax_error, never a crash', { skip: SKIP }, () => {
	assert.equal(analyze('x = 1\0').status, 'syntax_error')
	// Every parser-side analysis failure is permanent: the same source fails again.
	assert.deepEqual(analyze(12345), {
		status: 'analysis_error',
		message: 'source must be a string',
		permanent: true
	})
	assert.deepEqual(analyze(null), {
		status: 'analysis_error',
		message: 'source must be a string',
		permanent: true
	})
	assert.deepEqual(analyze('x' + ' '.repeat(FEATURE_LIMITS.maxSourceChars)), {
		status: 'analysis_error',
		message: 'source too large to analyze',
		permanent: true
	})
	// ...and a source exactly at the limit is still analysed.
	assert.equal(analyze('x = 1' + ' '.repeat(FEATURE_LIMITS.maxSourceChars - 5)).status, 'ok')
})

test('pathological nesting is bounded by the parser, not a hang or a crash', { skip: SKIP }, () => {
	// CPython refuses these itself ("too many nested parentheses" / "too many
	// levels of indentation"), which surfaces as a validated syntax_error.
	const brackets = analyze('x = ' + '['.repeat(5000) + ']'.repeat(5000))
	assert.ok(['syntax_error', 'analysis_error'].includes(brackets.status), brackets.status)
	const nest = (depth: number) =>
		Array.from({ length: depth }, (_, i) => `${' '.repeat(i)}for _ in y:`).join('\n') +
		`\n${' '.repeat(depth)}pass`
	assert.equal(analyze(nest(150)).status, 'syntax_error')
	// ...while a deep but legal nest is analysed, with its depth reported exactly.
	assert.equal(featuresOf(nest(90)).loops.maxDepth, 90)
})

test(
	'a lone surrogate (not encodable as UTF-8) is a permanent analysis_error',
	{ skip: SKIP },
	() => {
		const result = analyze('x = "\ud800"')
		assert.equal(result.status, 'analysis_error')
		if (result.status === 'analysis_error') assert.equal(result.permanent, true)
	}
)

test('learner code is parsed, never run', { skip: SKIP }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ast-never-runs-'))
	try {
		const marker = join(dir, 'marker.txt')
		const hostile = [
			`open(${JSON.stringify(marker)}, 'w').write('ran')`,
			'import os',
			'os.system("echo ran")',
			'raise SystemExit(1)',
			'while True:',
			'    pass'
		].join('\n')
		const f = featuresOf(hostile)
		assert.equal(f.loops.while, 1)
		assert.equal(existsSync(marker), false, 'the source was executed')
		assert.equal(analyze('def f():\n    raise RuntimeError("boom")\nf()').status, 'ok')
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test('the program itself contains no way to execute learner code', () => {
	assert.doesNotMatch(AST_PROGRAM, /\b(exec|eval|compile)\s*\(/)
	assert.doesNotMatch(AST_PROGRAM, /__import__|importlib|\bimport (os|sys|subprocess)\b/)
	assert.match(AST_PROGRAM, /ast\.parse\(/)
	assert.match(AST_PROGRAM, /ast\.NodeVisitor/)
})
