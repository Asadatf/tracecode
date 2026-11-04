import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
	clearAllTutorConversations,
	clearConversation,
	conversationKey,
	loadConversation,
	newConversation,
	saveConversation,
	type StorageLike
} from './conversation-store'

// In-memory fake that implements the sessionStorage surface we actually use.
class FakeStorage implements StorageLike {
	private data = new Map<string, string>()
	quota = Infinity

	get length(): number {
		return this.data.size
	}
	key(index: number): string | null {
		return Array.from(this.data.keys())[index] ?? null
	}
	getItem(k: string): string | null {
		return this.data.get(k) ?? null
	}
	setItem(k: string, v: string): void {
		if (v.length > this.quota) throw new Error('QuotaExceeded')
		this.data.set(k, v)
	}
	removeItem(k: string): void {
		this.data.delete(k)
	}
	dump(): string[] {
		return Array.from(this.data.keys())
	}
}

describe('tutor conversation store', () => {
	let s: FakeStorage
	beforeEach(() => {
		s = new FakeStorage()
	})

	it('save/load round-trips a fresh conversation', () => {
		const convo = newConversation()
		assert.equal(saveConversation('u1', 'two-sum', convo, s), true)
		const got = loadConversation('u1', 'two-sum', s)
		assert.deepEqual(got?.conversationId, convo.conversationId)
		assert.equal(got?.questionsUsed, 0)
	})

	it('keeps separate namespaces per (user, problem)', () => {
		saveConversation('u1', 'two-sum', { ...newConversation(), questionsUsed: 3 }, s)
		saveConversation('u1', 'binary-search', { ...newConversation(), questionsUsed: 7 }, s)
		saveConversation('u2', 'two-sum', { ...newConversation(), questionsUsed: 9 }, s)

		assert.equal(loadConversation('u1', 'two-sum', s)?.questionsUsed, 3)
		assert.equal(loadConversation('u1', 'binary-search', s)?.questionsUsed, 7)
		assert.equal(loadConversation('u2', 'two-sum', s)?.questionsUsed, 9)
	})

	it('logout clears every tutor key but leaves others alone', () => {
		saveConversation('u1', 'two-sum', newConversation(), s)
		saveConversation('u1', 'binary-search', newConversation(), s)
		s.setItem('unrelated', 'keep me')
		const n = clearAllTutorConversations(s)
		assert.equal(n, 2)
		assert.equal(s.getItem('unrelated'), 'keep me')
		assert.equal(loadConversation('u1', 'two-sum', s), null)
	})

	it('malformed JSON is treated as no conversation and removed', () => {
		s.setItem(conversationKey('u1', 'two-sum'), '{not json')
		assert.equal(loadConversation('u1', 'two-sum', s), null)
	})

	it('invalid envelope is rejected and removed', () => {
		s.setItem(conversationKey('u1', 'two-sum'), JSON.stringify({ v: 999 }))
		assert.equal(loadConversation('u1', 'two-sum', s), null)
	})

	it('quota exceeded does not throw', () => {
		s.quota = 10
		assert.equal(saveConversation('u1', 'two-sum', newConversation(), s), false)
	})

	it('clearConversation removes only the named entry', () => {
		saveConversation('u1', 'two-sum', newConversation(), s)
		saveConversation('u1', 'binary-search', newConversation(), s)
		clearConversation('u1', 'two-sum', s)
		assert.equal(loadConversation('u1', 'two-sum', s), null)
		assert.ok(loadConversation('u1', 'binary-search', s) != null)
	})
})
