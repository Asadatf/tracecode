import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	BACKFILL_MAX_BATCH,
	backfillCandidateQuery,
	clampBackfillLimit,
	setFeaturesIfMissingQuery
} from './code-feature-queries.ts'

// The actions run these query shapes through Prisma. Here a tiny in-memory
// table interprets the same `where` objects the way Postgres would, so the
// ownership and idempotency properties are checked on the real query values
// with two learners present. `MISSING` stands in for Prisma.DbNull.

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const MISSING = Symbol('DbNull')

interface Row {
	id: string
	userId: string
	source: string
	status: string
	createdAt: number
	codeFeatures: unknown
}
type Where = {
	id?: string
	userId: string
	codeFeatures: { equals: symbol }
	status?: { not: string }
}

function matches(row: Row, where: Where): boolean {
	return (
		(where.id === undefined || row.id === where.id) &&
		row.userId === where.userId &&
		(where.codeFeatures.equals === MISSING
			? row.codeFeatures === MISSING
			: row.codeFeatures === where.codeFeatures.equals) &&
		(where.status === undefined || row.status !== where.status.not)
	)
}

function table(): Row[] {
	const make = (id: string, userId: string, createdAt: number, extra: Partial<Row> = {}): Row => ({
		id,
		userId,
		source: `# source of ${id}`,
		status: 'completed',
		createdAt,
		codeFeatures: MISSING,
		...extra
	})
	return [
		...Array.from({ length: 14 }, (_, i) => make(`alice-${i}`, ALICE, i)),
		make('alice-done', ALICE, 100, { codeFeatures: { v: 1 } }),
		make('alice-syntax', ALICE, 101, { status: 'syntax_error' }),
		make('bob-1', BOB, 5),
		make('bob-2', BOB, 6)
	]
}

function list(rows: Row[], userId: string, limit: number) {
	const q = backfillCandidateQuery(userId, limit, MISSING)
	return rows
		.filter((r) => matches(r, q.where))
		.sort((a, b) => b.createdAt - a.createdAt)
		.slice(0, q.take)
}

test('backfill candidates are the learner’s own, newest first, missing features, parseable', () => {
	const rows = list(table(), ALICE, 5)
	assert.deepEqual(
		rows.map((r) => r.id),
		['alice-13', 'alice-12', 'alice-11', 'alice-10', 'alice-9']
	)
	assert.ok(rows.every((r) => r.userId === ALICE))
	assert.ok(!rows.some((r) => r.id === 'alice-done'), 'already has features')
	assert.ok(!rows.some((r) => r.id === 'alice-syntax'), 'can never parse')
})

test('another learner’s attempts never appear, whatever the limit', () => {
	const ids = list(table(), BOB, 10).map((r) => r.id)
	assert.deepEqual(ids.sort(), ['bob-1', 'bob-2'])
	assert.ok(list(table(), 'not-a-user', 10).length === 0)
})

test('the read is capped at the server-side batch limit', () => {
	assert.equal(BACKFILL_MAX_BATCH, 10)
	assert.equal(list(table(), ALICE, 10_000).length, 10)
	assert.equal(clampBackfillLimit(10_000), 10)
	assert.equal(clampBackfillLimit(0), 1)
	assert.equal(clampBackfillLimit(-5), 1)
	assert.equal(clampBackfillLimit(3.9), 3)
	assert.equal(clampBackfillLimit(Number.NaN), 10)
	assert.equal(clampBackfillLimit(Infinity), 10)
})

test('only the id and source are selected, and nothing is user-supplied in the filter', () => {
	const q = backfillCandidateQuery(ALICE, 5, MISSING)
	assert.deepEqual(q.select, { id: true, source: true })
	assert.equal(q.where.userId, ALICE)
	assert.deepEqual(q.orderBy, { createdAt: 'desc' })
})

function save(rows: Row[], userId: string, attemptId: string, features: unknown): number {
	const q = setFeaturesIfMissingQuery(userId, attemptId, features, MISSING)
	let count = 0
	for (const row of rows) {
		if (matches(row, q.where)) {
			row.codeFeatures = q.data.codeFeatures
			count += 1
		}
	}
	return count
}

test('saving sets features once; a second save of the same attempt is a no-op', () => {
	const rows = table()
	assert.equal(save(rows, ALICE, 'alice-3', { v: 1, first: true }), 1)
	assert.equal(save(rows, ALICE, 'alice-3', { v: 1, second: true }), 0)
	assert.deepEqual(rows.find((r) => r.id === 'alice-3')?.codeFeatures, { v: 1, first: true })
})

test('saving cannot touch another learner’s attempt, and cannot tell why it failed', () => {
	const rows = table()
	assert.equal(save(rows, ALICE, 'bob-1', { v: 1 }), 0)
	assert.equal(rows.find((r) => r.id === 'bob-1')?.codeFeatures, MISSING)
	// "Not yours", "does not exist" and "already set" are indistinguishable.
	assert.equal(save(rows, ALICE, 'no-such-attempt', { v: 1 }), 0)
	assert.equal(save(rows, ALICE, 'alice-done', { v: 1, overwrite: true }), 0)
	assert.deepEqual(rows.find((r) => r.id === 'alice-done')?.codeFeatures, { v: 1 })
})

test('the ownership and idempotency checks are part of one WHERE, so one statement', () => {
	const q = setFeaturesIfMissingQuery(ALICE, 'alice-1', { v: 1 }, MISSING)
	assert.deepEqual(Object.keys(q.where).sort(), ['codeFeatures', 'id', 'userId'])
	assert.equal(q.where.userId, ALICE)
	assert.deepEqual(q.where.codeFeatures, { equals: MISSING })
})
