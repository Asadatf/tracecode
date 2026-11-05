import test from 'node:test'
import assert from 'node:assert/strict'
import {
	isUndefinedColumnError,
	readWithColumnFallback,
	writeWithOptionalColumns
} from './optional-columns.ts'

const p2022 = (column: unknown) =>
	Object.assign(new Error('missing'), { code: 'P2022', meta: { column } })

test('only an undefined-column error that names the column is recognised', () => {
	assert.equal(isUndefinedColumnError(p2022('attempts.meaningful'), 'meaningful'), true)
	assert.equal(isUndefinedColumnError(p2022('meaningful'), 'meaningful'), true)
	assert.equal(isUndefinedColumnError(p2022('"meaningful"'), 'meaningful'), true)
	// Raw-query and bare-driver forms of SQLSTATE 42703.
	assert.equal(
		isUndefinedColumnError(
			{ code: 'P2010', meta: { code: '42703', message: 'column "meaningful" does not exist' } },
			'meaningful'
		),
		true
	)
	assert.equal(
		isUndefinedColumnError(
			{ code: '42703', message: 'column "meaningful" of relation "attempts" does not exist' },
			'meaningful'
		),
		true
	)
})

test('a different column, an unnamed column, or any other error is not recognised', () => {
	const others: unknown[] = [
		p2022('attempts.source'),
		p2022('attempts.meaningfulness'),
		p2022('(not available)'),
		p2022(undefined),
		{ code: 'P2022' },
		{ code: 'P2010', meta: { code: '23505', message: 'column "meaningful"' } },
		{ code: 'P2010', meta: { code: '42703', message: 'column "other" does not exist' } },
		{ code: '42P01', message: 'relation "attempts" does not exist' },
		{ code: '23502', message: 'null value in column "meaningful"' },
		{ code: 'P1001' },
		{ code: 'P2002', meta: { column: 'meaningful' } },
		new Error('column "meaningful" does not exist'),
		'P2022',
		null,
		undefined,
		42
	]
	for (const other of others) {
		assert.equal(isUndefinedColumnError(other, 'meaningful'), false, String(JSON.stringify(other)))
	}
})

test('write: success writes every optional column once', async () => {
	const calls: object[] = []
	const result = await writeWithOptionalColumns(
		{ meaningful: true, codeFeatures: { v: 1 } },
		async (e) => {
			calls.push(e)
			return 'ok'
		}
	)
	assert.equal(result, 'ok')
	assert.deepEqual(calls, [{ meaningful: true, codeFeatures: { v: 1 } }])
})

test('write: drops only the column the database says is undefined, then retries', async () => {
	const calls: object[] = []
	const dropped: string[] = []
	const result = await writeWithOptionalColumns(
		{ meaningful: true, codeFeatures: { v: 1 } },
		async (e) => {
			calls.push(e)
			if ('meaningful' in e) throw p2022('attempts.meaningful')
			return 'ok'
		},
		(column) => dropped.push(column)
	)
	assert.equal(result, 'ok')
	assert.deepEqual(calls, [
		{ meaningful: true, codeFeatures: { v: 1 } },
		{ codeFeatures: { v: 1 } }
	])
	assert.deepEqual(dropped, ['meaningful'])
})

test('write: both columns missing falls back to the plain pre-M7 write, in either report order', async () => {
	for (const order of [
		['codeFeatures', 'meaningful'],
		['meaningful', 'codeFeatures']
	]) {
		const calls: object[] = []
		const result = await writeWithOptionalColumns(
			{ meaningful: true, codeFeatures: 1 },
			async (e) => {
				calls.push(e)
				const next = order.find((c) => c in e)
				if (next != null) throw p2022(`attempts.${next}`)
				return 'plain'
			}
		)
		assert.equal(result, 'plain')
		assert.deepEqual(calls.at(-1), {})
	}
})

test('write: unrelated failures propagate at once, with no retry', async () => {
	const failures = [
		new Error('connection refused'),
		Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['id'] } }),
		Object.assign(new Error('timeout'), { code: 'P1008' }),
		p2022('attempts.source'),
		p2022('(not available)'),
		Object.assign(new Error('fk'), { code: '23503' })
	]
	for (const failure of failures) {
		let calls = 0
		await assert.rejects(
			writeWithOptionalColumns({ meaningful: true }, async () => {
				calls += 1
				throw failure
			}),
			(error) => error === failure
		)
		assert.equal(calls, 1)
	}
})

test('write: a failure on the final plain write propagates (never loops)', async () => {
	const failure = new Error('disk full')
	let calls = 0
	await assert.rejects(
		writeWithOptionalColumns({ meaningful: true }, async (e) => {
			calls += 1
			if ('meaningful' in e) throw p2022('attempts.meaningful')
			throw failure
		}),
		(error) => error === failure
	)
	assert.equal(calls, 2)
})

test('read: falls back only for the named undefined column', async () => {
	const out = await readWithColumnFallback(
		'meaningful',
		async () => {
			throw p2022('attempts.meaningful')
		},
		async () => 'legacy'
	)
	assert.equal(out, 'legacy')
	assert.equal(
		await readWithColumnFallback(
			'meaningful',
			async () => 'new',
			async () => 'legacy'
		),
		'new'
	)
})

test('read: unrelated failures propagate and never reach the fallback', async () => {
	const failures = [
		new Error('connection refused'),
		Object.assign(new Error('x'), { code: 'P1001' }),
		p2022('attempts.codeFeatures'),
		p2022('(not available)')
	]
	for (const failure of failures) {
		let fallbackRan = false
		await assert.rejects(
			readWithColumnFallback(
				'meaningful',
				async () => {
					throw failure
				},
				async () => {
					fallbackRan = true
					return 'legacy'
				}
			),
			(error) => error === failure
		)
		assert.equal(fallbackRan, false)
	}
})
