import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_NOTE_CHARS, isEmptyNote, saveNoteInput } from './problem-notes'

// specs/features/problem-notes.md

test('AC6: a note may be up to 2 000 characters, not more', () => {
	assert.ok(
		saveNoteInput.safeParse({ problemSlug: 'two-sum', body: 'x'.repeat(MAX_NOTE_CHARS) }).success
	)
	assert.ok(
		!saveNoteInput.safeParse({ problemSlug: 'two-sum', body: 'x'.repeat(MAX_NOTE_CHARS + 1) })
			.success
	)
})

test('the problem must exist in the registry', () => {
	assert.ok(saveNoteInput.safeParse({ problemSlug: 'climbing-stairs', body: 'dp' }).success)
	assert.ok(!saveNoteInput.safeParse({ problemSlug: 'not-a-problem', body: 'x' }).success)
	assert.ok(!saveNoteInput.safeParse({ problemSlug: 'constructor', body: 'x' }).success)
})

test('AC7: whitespace-only notes count as empty', () => {
	assert.equal(isEmptyNote(''), true)
	assert.equal(isEmptyNote('  \n\t'), true)
	assert.equal(isEmptyNote(' use a set '), false)
})

test('AC8: the input carries no user id, so the server can only use the session', () => {
	const parsed = saveNoteInput.parse({ problemSlug: 'two-sum', body: 'x', userId: 'someone-else' })
	assert.equal('userId' in parsed, false)
})
