import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RECENT_ATTEMPTS_LIMIT, recentAttemptsQuery } from './recent-attempts-query.ts'
import { isMissingColumnError } from './missing-column.ts'

// Regression: the progress page's attempts query had no `select`, so it read every
// column of `attempts`. Once the client knows `codeFeatures`, that would have
// broken /progress for every signed-in learner on any database that had not run
// the codeFeatures migration yet.
test('the recent-attempts query selects exactly what the progress page and dashboard use', () => {
	const q = recentAttemptsQuery('learner-1')
	assert.deepEqual(Object.keys(q.select).sort(), [
		'allPassed',
		'createdAt',
		'problemSlug',
		'status',
		'testsPassed',
		'testsTotal'
	])
	assert.ok(!('codeFeatures' in q.select), 'must not depend on the new column')
	assert.ok(!('source' in q.select), 'must not read every attempt’s full source')
	assert.deepEqual(q.where, { userId: 'learner-1' }, 'scoped to the signed-in learner')
	assert.equal(q.take, RECENT_ATTEMPTS_LIMIT)
	assert.deepEqual(q.orderBy, { createdAt: 'desc' })
})

test('a missing database column (Prisma P2022) is recognised; nothing else is', () => {
	assert.equal(
		isMissingColumnError({ code: 'P2022', meta: { column: 'attempts.codeFeatures' } }),
		true
	)
	assert.equal(isMissingColumnError(Object.assign(new Error('boom'), { code: 'P2022' })), true)
	for (const other of [
		{ code: 'P2002' },
		{ code: 'P2025' },
		new Error('P2022'),
		null,
		undefined,
		'P2022',
		42,
		{}
	]) {
		assert.equal(isMissingColumnError(other), false, String(JSON.stringify(other)))
	}
})
