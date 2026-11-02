import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attemptEvidenceQuery } from './attempt-evidence-query.ts'
import { EVOLUTION_WINDOW } from './solution-evolution.ts'

test('the evidence query is scoped to the learner and the problem, and bounded to the window', () => {
	const q = attemptEvidenceQuery('learner-1', 'two-sum', true)
	assert.deepEqual(q.where, { userId: 'learner-1', problemSlug: 'two-sum' })
	assert.equal(q.take, EVOLUTION_WINDOW)
	assert.deepEqual(q.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }])
})

test('the learner’s source code is never selected', () => {
	for (const withFeatures of [true, false]) {
		const q = attemptEvidenceQuery('u', 'two-sum', withFeatures)
		assert.ok(!('source' in q.select))
		assert.deepEqual(q.select.testResults, { where: { passed: false }, select: { testId: true } })
		for (const column of [
			'id',
			'problemSlug',
			'createdAt',
			'status',
			'testsPassed',
			'testsTotal',
			'allPassed'
		]) {
			assert.equal(q.select[column as keyof typeof q.select], true, column)
		}
	}
})

test('the fingerprint column is selected only when the database has it', () => {
	assert.equal('codeFeatures' in attemptEvidenceQuery('u', 's', true).select, true)
	assert.equal('codeFeatures' in attemptEvidenceQuery('u', 's', false).select, false)
})
