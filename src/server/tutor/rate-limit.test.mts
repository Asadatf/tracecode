import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { __rateLimitInternal, checkRateLimit } from './rate-limit'

describe('tutor rate limit', () => {
	beforeEach(() => {
		__rateLimitInternal.buckets.clear()
	})

	it('allows up to MAX_REQUESTS inside the window', () => {
		for (let i = 0; i < __rateLimitInternal.MAX_REQUESTS; i++) {
			assert.equal(checkRateLimit('u', 1000 + i).ok, true)
		}
	})

	it('rejects the (MAX_REQUESTS+1)th call', () => {
		for (let i = 0; i < __rateLimitInternal.MAX_REQUESTS; i++) checkRateLimit('u', 1000)
		const limited = checkRateLimit('u', 1000)
		assert.equal(limited.ok, false)
		assert.ok((limited.retryAfterMs ?? 0) > 0)
	})

	it('resets after the window closes', () => {
		for (let i = 0; i < __rateLimitInternal.MAX_REQUESTS; i++) checkRateLimit('u', 1000)
		const okAgain = checkRateLimit('u', 1000 + __rateLimitInternal.WINDOW_MS + 1)
		assert.equal(okAgain.ok, true)
	})

	it('isolates buckets per user', () => {
		for (let i = 0; i < __rateLimitInternal.MAX_REQUESTS; i++) checkRateLimit('a', 1000)
		assert.equal(checkRateLimit('b', 1000).ok, true)
	})
})
