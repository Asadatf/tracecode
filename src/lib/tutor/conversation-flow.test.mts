import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isLimitReached, settleExchange } from './conversation-flow'
import {
	loadConversation,
	newConversation,
	saveConversation,
	type StorageLike,
	type StoredConversation
} from './conversation-store'
import { MAX_QUESTIONS_PER_CONVERSATION, type TutorMessage } from './types'

const msg = (id: string, role: 'user' | 'assistant', text: string): TutorMessage => ({
	id,
	role,
	text
})
const question = msg('q', 'user', 'why does this fail?')
const reply = msg('a', 'assistant', 'Because of the loop bounds.')

class Store implements StorageLike {
	private d = new Map<string, string>()
	get length() {
		return this.d.size
	}
	key(i: number) {
		return [...this.d.keys()][i] ?? null
	}
	getItem(k: string) {
		return this.d.get(k) ?? null
	}
	setItem(k: string, v: string) {
		this.d.set(k, v)
	}
	removeItem(k: string) {
		this.d.delete(k)
	}
}

describe('what an exchange does to the conversation', () => {
	it('a finished reply commits the question and the answer and counts exactly one', () => {
		const base = newConversation()
		const s = settleExchange({ base, question, reply, outcome: { kind: 'done', text: reply.text } })
		assert.equal(s.kind, 'commit')
		if (s.kind !== 'commit') return
		assert.equal(s.conversation.questionsUsed, 1)
		assert.deepEqual(
			s.conversation.messages.map((m) => m.role),
			['user', 'assistant']
		)
	})

	it('failed, cut off and stopped exchanges commit nothing and consume no question', () => {
		const base: StoredConversation = { ...newConversation(), questionsUsed: 6 }
		for (const outcome of [
			{ kind: 'failed' as const, message: 'cut off', retryable: true },
			{ kind: 'cancelled' as const }
		]) {
			const s = settleExchange({ base, question, reply: null, outcome })
			assert.equal(s.kind, 'rollback')
			if (s.kind !== 'rollback') return
			assert.equal(s.conversation.questionsUsed, 6, 'counter unchanged')
			assert.deepEqual(s.conversation.messages, base.messages, 'transcript unchanged')
			assert.equal(s.retryText, question.text, 'question kept for retry, no retyping')
		}
	})

	it('a stopped exchange is labelled cancelled and a failed one failed', () => {
		const base = newConversation()
		const stopped = settleExchange({ base, question, reply: null, outcome: { kind: 'cancelled' } })
		const failed = settleExchange({
			base,
			question,
			reply: null,
			outcome: { kind: 'failed', message: 'boom', retryable: false }
		})
		assert.equal(stopped.kind === 'rollback' && stopped.reason, 'cancelled')
		assert.equal(failed.kind === 'rollback' && failed.reason, 'failed')
		assert.equal(failed.kind === 'rollback' && failed.retryable, false)
	})

	it('a stale response changes nothing at all', () => {
		const s = settleExchange({
			base: newConversation(),
			question,
			reply,
			outcome: { kind: 'stale' }
		})
		assert.deepEqual(s, { kind: 'ignore' })
	})

	it('a partial reply can never be committed: only `done` carries text', () => {
		// Even if a caller wrongly passes a reply, a non-done outcome must not commit it.
		const s = settleExchange({
			base: newConversation(),
			question,
			reply,
			outcome: { kind: 'failed', message: 'cut off', retryable: true }
		})
		assert.equal(s.kind, 'rollback')
	})
})

describe('the 15-question limit across a session', () => {
	it('allows 14 questions, hits the limit on the 15th, and failures never advance it', () => {
		let convo = newConversation()
		for (let n = 1; n <= MAX_QUESTIONS_PER_CONVERSATION; n += 1) {
			// A failure before each success must not move the counter.
			const failed = settleExchange({
				base: convo,
				question,
				reply: null,
				outcome: { kind: 'failed', message: 'x', retryable: true }
			})
			assert.equal(failed.kind === 'rollback' && failed.conversation.questionsUsed, n - 1)
			const ok = settleExchange({
				base: convo,
				question,
				reply,
				outcome: { kind: 'done', text: 'r' }
			})
			assert.equal(ok.kind, 'commit')
			if (ok.kind === 'commit') convo = ok.conversation
			assert.equal(isLimitReached(convo), n === MAX_QUESTIONS_PER_CONVERSATION)
		}
		assert.equal(convo.questionsUsed, MAX_QUESTIONS_PER_CONVERSATION)
		assert.equal(convo.messages.length, MAX_QUESTIONS_PER_CONVERSATION * 2)
	})
})

describe('refresh and problem switching', () => {
	it('a completed conversation survives a refresh (reload from sessionStorage)', () => {
		const storage = new Store()
		const ok = settleExchange({
			base: newConversation(),
			question,
			reply,
			outcome: { kind: 'done', text: 'r' }
		})
		assert.equal(ok.kind, 'commit')
		if (ok.kind !== 'commit') return
		saveConversation('u1', 'two-sum', ok.conversation, storage)
		const reloaded = loadConversation('u1', 'two-sum', storage)
		assert.equal(reloaded?.questionsUsed, 1)
		assert.equal(reloaded?.messages.length, 2)
	})

	it('a stopped or failed exchange leaves the saved conversation exactly as it was', () => {
		const storage = new Store()
		const base: StoredConversation = { ...newConversation(), questionsUsed: 3 }
		saveConversation('u1', 'two-sum', base, storage)
		const s = settleExchange({ base, question, reply: null, outcome: { kind: 'cancelled' } })
		assert.equal(s.kind, 'rollback')
		// A stale/ignored settle does not even write; a rollback rewrites the base.
		if (s.kind === 'rollback') saveConversation('u1', 'two-sum', s.conversation, storage)
		const reloaded = loadConversation('u1', 'two-sum', storage)
		assert.equal(reloaded?.questionsUsed, 3)
		assert.deepEqual(reloaded?.messages, base.messages)
	})

	it('a stale response for problem A cannot touch problem B', () => {
		const storage = new Store()
		const a: StoredConversation = { ...newConversation(), questionsUsed: 2 }
		const b: StoredConversation = { ...newConversation(), questionsUsed: 9 }
		saveConversation('u1', 'two-sum', a, storage)
		saveConversation('u1', 'binary-search', b, storage)
		const s = settleExchange({ base: a, question, reply, outcome: { kind: 'stale' } })
		assert.equal(s.kind, 'ignore') // nothing is written anywhere
		assert.equal(loadConversation('u1', 'binary-search', storage)?.questionsUsed, 9)
		assert.equal(loadConversation('u1', 'two-sum', storage)?.questionsUsed, 2)
	})
})
