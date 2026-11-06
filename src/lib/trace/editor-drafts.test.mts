import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	MAX_DRAFT_CHARS,
	clearDraft,
	draftKey,
	readDraft,
	writeDraft,
	type DraftStorage
} from './editor-drafts'

// specs/features/editor-drafts.md

function memoryStorage(): DraftStorage & { data: Map<string, string> } {
	const data = new Map<string, string>()
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value),
		removeItem: (key) => void data.delete(key)
	}
}

const throwing: DraftStorage = {
	getItem: () => {
		throw new Error('SecurityError')
	},
	setItem: () => {
		throw new Error('QuotaExceededError')
	},
	removeItem: () => {
		throw new Error('SecurityError')
	}
}

const STARTER = 'def two_sum(nums, target):\n    return []'
const EDITED = 'def two_sum(nums, target):\n    return [0, 1]'
const NOW = new Date('2026-11-03T10:00:00.000Z')

test('AC1: a written draft reads back with its code', () => {
	const storage = memoryStorage()
	writeDraft(storage, 'two-sum', EDITED, STARTER, NOW)
	assert.deepEqual(readDraft(storage, 'two-sum'), {
		code: EDITED,
		savedAt: NOW.toISOString()
	})
})

test('AC3: clearing removes the draft', () => {
	const storage = memoryStorage()
	writeDraft(storage, 'two-sum', EDITED, STARTER, NOW)
	clearDraft(storage, 'two-sum')
	assert.equal(readDraft(storage, 'two-sum'), null)
})

test('AC4: drafts are kept per problem', () => {
	const storage = memoryStorage()
	writeDraft(storage, 'two-sum', EDITED, STARTER, NOW)
	writeDraft(storage, 'climbing-stairs', 'def climb_stairs(n):\n    return 1', 'x', NOW)
	assert.equal(readDraft(storage, 'two-sum')?.code, EDITED)
	assert.equal(readDraft(storage, 'climbing-stairs')?.code, 'def climb_stairs(n):\n    return 1')
	assert.equal(readDraft(storage, 'move-zeroes'), null)
})

test('AC5: code equal to the starter is not stored, and clears an old draft', () => {
	const storage = memoryStorage()
	writeDraft(storage, 'two-sum', STARTER, STARTER, NOW)
	assert.equal(storage.data.size, 0)
	writeDraft(storage, 'two-sum', EDITED, STARTER, NOW)
	writeDraft(storage, 'two-sum', STARTER, STARTER, NOW)
	assert.equal(readDraft(storage, 'two-sum'), null)
})

test('AC6: throwing or missing storage never throws and reads as no draft', () => {
	assert.doesNotThrow(() => writeDraft(throwing, 'two-sum', EDITED, STARTER, NOW))
	assert.equal(readDraft(throwing, 'two-sum'), null)
	assert.doesNotThrow(() => clearDraft(throwing, 'two-sum'))
	assert.equal(readDraft(null, 'two-sum'), null)
	assert.doesNotThrow(() => writeDraft(null, 'two-sum', EDITED, STARTER, NOW))
})

test('edge: invalid stored values are ignored and removed', () => {
	const storage = memoryStorage()
	storage.setItem(draftKey('two-sum'), 'not json')
	assert.equal(readDraft(storage, 'two-sum'), null)
	assert.equal(storage.data.has(draftKey('two-sum')), false)
	storage.setItem(draftKey('two-sum'), JSON.stringify({ code: 42 }))
	assert.equal(readDraft(storage, 'two-sum'), null)
	assert.equal(storage.data.has(draftKey('two-sum')), false)
})

test('edge: drafts over the size cap are not saved', () => {
	const storage = memoryStorage()
	writeDraft(storage, 'two-sum', 'x'.repeat(MAX_DRAFT_CHARS + 1), STARTER, NOW)
	assert.equal(storage.data.size, 0)
})
