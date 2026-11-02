import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RESEND_EMAILS_URL, failureForResendStatus, isRetryableSend, sendEmail } from './resend.ts'

// M7.5B — the Resend wrapper against a mocked fetch. No network, ever.

const EMAIL = {
	from: 'reminders@mail.tracecode.dev',
	to: 'learner@example.com',
	subject: 'Hi',
	html: '<p>Hi</p>',
	text: 'Hi',
	idempotencyKey: 'reminder:user-1:2026-11-02',
	headers: { 'List-Unsubscribe': '<https://x/api/notifications/unsubscribe?token=t>' }
}

function mockFetch(respond: () => Response | Promise<Response>) {
	const calls: { url: string; init: RequestInit }[] = []
	const impl = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} })
		return respond()
	}) as typeof fetch
	return { impl, calls }
}

test('a 200 with an id is accepted, and the request carries key, idempotency key and headers', async () => {
	const { impl, calls } = mockFetch(() => Response.json({ id: 'msg_123' }))
	const result = await sendEmail('re_key', EMAIL, impl)
	assert.deepEqual(result, { ok: true, id: 'msg_123' })
	assert.equal(calls.length, 1)
	assert.equal(calls[0]?.url, RESEND_EMAILS_URL)
	const headers = calls[0]?.init.headers as Record<string, string>
	assert.equal(headers.authorization, 'Bearer re_key')
	assert.equal(headers['idempotency-key'], 'reminder:user-1:2026-11-02')
	const body = JSON.parse(String(calls[0]?.init.body))
	assert.deepEqual(body.to, ['learner@example.com'])
	assert.equal(body.headers['List-Unsubscribe'], EMAIL.headers['List-Unsubscribe'])
})

test('provider errors map to typed, safe reasons — never the provider message', async () => {
	const cases: [number, string][] = [
		[429, 'rate_limited'],
		[500, 'server_error'],
		[503, 'server_error'],
		[409, 'conflict'],
		[400, 'rejected'],
		[401, 'rejected'],
		[422, 'rejected']
	]
	for (const [status, reason] of cases) {
		const { impl } = mockFetch(
			() => new Response(JSON.stringify({ message: 'learner@example.com is invalid' }), { status })
		)
		const result = await sendEmail('k', EMAIL, impl)
		assert.deepEqual(result, { ok: false, reason, status })
		assert.ok(!JSON.stringify(result).includes('@'), 'no address leaks into the result')
	}
})

test('timeouts, network errors and id-less 2xx responses are handled', async () => {
	const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' })
	assert.deepEqual(await sendEmail('k', EMAIL, mockFetch(() => Promise.reject(timeout)).impl), {
		ok: false,
		reason: 'timeout'
	})
	assert.deepEqual(
		await sendEmail('k', EMAIL, mockFetch(() => Promise.reject(new TypeError('dns'))).impl),
		{ ok: false, reason: 'network_error' }
	)
	assert.deepEqual(await sendEmail('k', EMAIL, mockFetch(() => Response.json({})).impl), {
		ok: false,
		reason: 'invalid_response'
	})
	assert.deepEqual(
		await sendEmail('k', EMAIL, mockFetch(() => new Response('not json', { status: 200 })).impl),
		{ ok: false, reason: 'invalid_response' }
	)
})

test('only transient failures are retryable; rejected and invalid responses are not', () => {
	assert.equal(failureForResendStatus(202), null)
	for (const r of [
		'server_error',
		'conflict',
		'timeout',
		'network_error',
		'rate_limited'
	] as const) {
		assert.equal(isRetryableSend(r), true, r)
	}
	assert.equal(isRetryableSend('rejected'), false)
	assert.equal(isRetryableSend('invalid_response'), false)
})
