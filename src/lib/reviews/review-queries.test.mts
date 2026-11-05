import test from 'node:test'
import assert from 'node:assert/strict'
import {
	advanceReviewQuery,
	createReviewData,
	dayColumn,
	dueReviewsQuery,
	findReviewQuery,
	markRemindedQuery,
	unremindedDueQuery
} from './review-queries.ts'

test('days are UTC dates', () => {
	assert.equal(dayColumn('2026-11-12').toISOString(), '2026-11-12T00:00:00.000Z')
})

test('the due queue is scoped to the given learner and to pending reviews due by today', () => {
	const query = dueReviewsQuery('user-1', '2026-11-12')
	assert.equal(query.where.userId, 'user-1')
	assert.equal(query.where.completedAt, null)
	assert.equal(query.where.dueDay.lte.toISOString(), '2026-11-12T00:00:00.000Z')
	assert.deepEqual(query.orderBy, [{ dueDay: 'asc' }, { problemSlug: 'asc' }])
})

test('the queue never reads another learner: a different id gives a different, id-bound filter', () => {
	assert.equal(dueReviewsQuery('user-2', '2026-11-12').where.userId, 'user-2')
	assert.equal(findReviewQuery('user-2', 'two-sum').where.userId_problemSlug.userId, 'user-2')
	const text = JSON.stringify(dueReviewsQuery('user-1', '2026-11-12'))
	assert.equal(text.includes('user-2'), false)
})

test('queue and lookup select only the review fields: nothing about attempts, code or contact', () => {
	for (const q of [dueReviewsQuery('u', '2026-11-12'), findReviewQuery('u', 's')]) {
		assert.deepEqual(Object.keys(q.select).sort(), [
			'completedAt',
			'dueDay',
			'problemSlug',
			'reviewsDone'
		])
	}
})

test('enrolment inserts if absent and never overwrites an existing row', () => {
	const args = createReviewData('u', 'two-sum', { reviewsDone: 0, dueDay: '2026-11-11' })
	assert.equal(args.skipDuplicates, true)
	assert.equal(args.data[0]?.reviewsDone, 0)
})

test('the advance matches only a row still at the stage and due day the caller saw', () => {
	const q = advanceReviewQuery(
		'u',
		'two-sum',
		{ reviewsDone: 0, dueDay: '2026-11-11' },
		{ reviewsDone: 1, dueDay: '2026-11-14' },
		false,
		new Date('2026-11-11T10:00:00Z')
	)
	assert.equal(q.where.reviewsDone, 0)
	assert.equal(q.where.dueDay.toISOString(), '2026-11-11T00:00:00.000Z')
	assert.equal(q.where.completedAt, null)
	assert.equal(q.data.reviewsDone, 1)
	assert.equal(q.data.remindedAt, null, 'the next stage is announced afresh')
	assert.equal(q.data.completedAt, null)
})

test('the final advance records completion', () => {
	const at = new Date('2026-11-21T10:00:00Z')
	const q = advanceReviewQuery(
		'u',
		's',
		{ reviewsDone: 2, dueDay: '2026-11-21' },
		{ reviewsDone: 3, dueDay: '2026-11-21' },
		true,
		at
	)
	assert.equal(q.data.completedAt, at)
})

test('the reminder scan wants pending, due and not-yet-announced reviews, bounded', () => {
	const q = unremindedDueQuery('2026-11-12', 50)
	assert.equal(q.where.completedAt, null)
	assert.equal(q.where.remindedAt, null)
	assert.equal(q.take, 50)
	assert.deepEqual(Object.keys(q.select).sort(), ['dueDay', 'problemSlug', 'reviewsDone', 'userId'])
})

test('marking announced matches only the stage that was announced and only if unmarked', () => {
	const q = markRemindedQuery('u', 'two-sum', 1, new Date())
	assert.equal(q.where.reviewsDone, 1)
	assert.equal(q.where.remindedAt, null)
	assert.equal(q.where.completedAt, null)
})
