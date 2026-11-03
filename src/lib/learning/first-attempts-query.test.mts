import test from 'node:test'
import assert from 'node:assert/strict'
import { firstAttemptsQuery, toFirstAttempts } from './first-attempts-query.ts'

test('the first-attempts query is scoped to the learner and reads one aggregate per problem', () => {
	const q = firstAttemptsQuery('learner-1')
	assert.deepEqual(q.where, { userId: 'learner-1' })
	assert.deepEqual(q.by, ['problemSlug'])
	assert.deepEqual(q._min, { createdAt: true })
	// Nothing heavy can ride along on an aggregate.
	assert.deepEqual(Object.keys(q).sort(), ['_min', 'by', 'where'])
})

test('rows become a slug → ISO time map, skipping a problem with no time', () => {
	assert.deepEqual(
		toFirstAttempts([
			{ problemSlug: 'two-sum', _min: { createdAt: new Date('2026-10-30T08:00:00.000Z') } },
			{ problemSlug: 'move-zeroes', _min: { createdAt: null } }
		]),
		{ 'two-sum': '2026-10-30T08:00:00.000Z' }
	)
	assert.deepEqual(toFirstAttempts([]), {})
})
