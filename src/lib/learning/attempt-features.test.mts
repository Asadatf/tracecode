import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withCodeFeatures } from './attempt-features.ts'
import { analysisError, type AstResult, type CodeFeatures } from '../trace/code-features.ts'

const FEATURES: CodeFeatures = {
	v: 1,
	loops: { for: 1, while: 0, maxDepth: 1 },
	comprehensions: 0,
	branches: 0,
	returns: 1,
	defs: 1,
	recursion: false,
	usesDict: false,
	usesSet: false,
	usesSorted: false,
	builtinCalls: [],
	nodeCount: 10,
	lineCount: 3
}
const payload = {
	problemSlug: 'two-sum',
	source: 'def two_sum(nums, target):\n    return []',
	status: 'completed'
}

test('the features are computed from the exact source that is saved', async () => {
	const analysed: string[] = []
	const result = await withCodeFeatures(payload, async (source) => {
		analysed.push(source)
		return { status: 'ok', features: FEATURES }
	})
	assert.deepEqual(analysed, [payload.source], 'analyzer saw exactly payload.source')
	assert.equal(result.source, payload.source)
	assert.deepEqual(result.codeFeatures, FEATURES)
})

test('two submissions in flight each keep their own features', async () => {
	const featuresBySource = new Map<string, CodeFeatures>([
		['a = 1', { ...FEATURES, lineCount: 1 }],
		['b = 2\nb = 3', { ...FEATURES, lineCount: 2 }]
	])
	const analyze = async (source: string): Promise<AstResult> => {
		await new Promise((resolve) => setTimeout(resolve, source === 'a = 1' ? 10 : 0))
		return { status: 'ok', features: featuresBySource.get(source) as CodeFeatures }
	}
	const [first, second] = await Promise.all([
		withCodeFeatures({ source: 'a = 1' }, analyze),
		withCodeFeatures({ source: 'b = 2\nb = 3' }, analyze)
	])
	assert.equal(first.codeFeatures?.lineCount, 1)
	assert.equal(second.codeFeatures?.lineCount, 2)
})

test('any non-ok outcome saves the attempt unchanged, as before M7', async () => {
	const outcomes: AstResult[] = [
		{ status: 'syntax_error', syntaxError: { message: 'invalid syntax', line: 1, column: 0 } },
		analysisError('source too large to analyze', true),
		analysisError('analysis timed out'),
		analysisError('analysis worker unavailable')
	]
	for (const outcome of outcomes) {
		const result = await withCodeFeatures(payload, async () => outcome)
		assert.deepEqual(result, payload)
		assert.ok(!('codeFeatures' in result))
	}
})

test('a throwing or rejecting analyzer never rejects and never loses the attempt', async () => {
	const rejecting = await withCodeFeatures(payload, async () => {
		throw new Error('worker exploded')
	})
	assert.deepEqual(rejecting, payload)
	const sync = await withCodeFeatures(payload, () => {
		throw new Error('threw before returning a promise')
	})
	assert.deepEqual(sync, payload)
})

test('the payload is not mutated', async () => {
	const frozen = Object.freeze({ ...payload })
	const result = await withCodeFeatures(frozen, async () => ({ status: 'ok', features: FEATURES }))
	assert.ok(!('codeFeatures' in frozen))
	assert.notEqual(result, frozen)
})
