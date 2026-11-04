import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { LIMITS, MAX_QUESTIONS_PER_CONVERSATION, tutorRequestSchema } from './types'

describe('tutor request schema', () => {
	const base = {
		problemSlug: 'two-sum',
		conversationId: 'abc',
		messages: [{ id: 'm1', role: 'user' as const, text: 'why does this fail?' }],
		context: {}
	}

	it('accepts a minimal request', () => {
		const parsed = tutorRequestSchema.parse(base)
		assert.equal(parsed.problemSlug, 'two-sum')
	})

	it('rejects a message over the per-message char cap', () => {
		assert.throws(() =>
			tutorRequestSchema.parse({
				...base,
				messages: [{ id: 'm1', role: 'user', text: 'x'.repeat(LIMITS.maxMessageChars + 1) }]
			})
		)
	})

	it('rejects empty messages array', () => {
		assert.throws(() => tutorRequestSchema.parse({ ...base, messages: [] }))
	})

	it('rejects code over the max char cap', () => {
		assert.throws(() =>
			tutorRequestSchema.parse({
				...base,
				context: { code: 'x'.repeat(LIMITS.maxCodeChars + 1) }
			})
		)
	})

	it('rejects more than maxFailedTests failed-test entries', () => {
		assert.throws(() =>
			tutorRequestSchema.parse({
				...base,
				context: {
					failedTests: Array.from({ length: LIMITS.maxFailedTests + 1 }, (_, i) => ({
						id: `t${i}`,
						args: [1],
						expected: '1'
					}))
				}
			})
		)
	})

	it('accepts pre-formatted expected/actual strings', () => {
		const parsed = tutorRequestSchema.parse({
			...base,
			context: {
				failedTests: [{ id: 't1', args: [[2, 7], 9], expected: '[0, 1]', actual: '[0, 2]' }]
			}
		})
		assert.equal(parsed.context.failedTests?.[0]?.expected, '[0, 1]')
	})

	it('accepts a well-formed replay step', () => {
		const parsed = tutorRequestSchema.parse({
			...base,
			context: { replay: { line: 3, locals: { i: '0' } } }
		})
		assert.equal(parsed.context.replay?.line, 3)
	})

	it('question limit is 15 (UX constant)', () => {
		assert.equal(MAX_QUESTIONS_PER_CONVERSATION, 15)
	})
})
