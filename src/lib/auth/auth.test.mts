import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AppError } from '../errors/app-error.ts'
import { credentialsSchema, userCausedAuthMessage } from './credentials.ts'
import { resolveLearnerId } from './learner.ts'
import { assertOwnedBy } from './ownership.ts'
import { authHref, safeReturnTo } from './return-to.ts'
import { practiceAccess } from './access.ts'
import { headerNav } from '../home/header-nav.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

test('credentials: normalises the email and requires a known mode', () => {
	const ok = credentialsSchema.parse({
		mode: 'sign-in',
		email: '  Learner@Example.COM ',
		password: 'correct horse'
	})
	assert.equal(ok.email, 'learner@example.com')
	assert.equal(credentialsSchema.safeParse({ ...ok, mode: 'admin' }).success, false)
	assert.equal(credentialsSchema.safeParse({ ...ok, mode: null }).success, false)
})

test('credentials: rejects a malformed email and out-of-range passwords', () => {
	const base = { mode: 'sign-up', email: 'a@b.co', password: 'longenough' }
	assert.equal(credentialsSchema.safeParse(base).success, true)
	assert.equal(credentialsSchema.safeParse({ ...base, email: 'not-an-email' }).success, false)
	assert.equal(credentialsSchema.safeParse({ ...base, password: 'short' }).success, false)
	assert.equal(credentialsSchema.safeParse({ ...base, password: 'x'.repeat(73) }).success, false)
})

test('auth errors: user-caused codes get a message, anything else is left to captureError', () => {
	assert.equal(userCausedAuthMessage('invalid_credentials'), 'Incorrect email or password.')
	assert.match(userCausedAuthMessage('email_not_confirmed') ?? '', /Confirm your email/)
	assert.equal(userCausedAuthMessage('unexpected_failure'), null)
	assert.equal(userCausedAuthMessage(undefined), null)
})

test('provisioning: the verified identity is provisioned once and its id returned', async () => {
	const calls: Array<{ id: string; email: string }> = []
	const id = await resolveLearnerId({ id: USER, email: 'learner@example.com' }, async (u) => {
		calls.push(u)
	})
	assert.equal(id, USER)
	assert.deepEqual(calls, [{ id: USER, email: 'learner@example.com' }])
})

test('provisioning: no session, or no email, provisions nothing and persists nothing', async () => {
	let provisioned = 0
	const provision = async () => {
		provisioned += 1
	}
	assert.equal(await resolveLearnerId(null, provision), null)
	assert.equal(await resolveLearnerId(undefined, provision), null)
	assert.equal(await resolveLearnerId({ id: USER, email: null }, provision), null)
	assert.equal(await resolveLearnerId({ id: USER, email: '' }, provision), null)
	assert.equal(provisioned, 0)
})

test('provisioning: a failure propagates instead of returning an id for a missing row', async () => {
	await assert.rejects(
		resolveLearnerId({ id: USER, email: 'learner@example.com' }, async () => {
			throw new Error('db down')
		}),
		/db down/
	)
})

test('ownership: the owner passes', () => {
	assert.doesNotThrow(() => assertOwnedBy(USER, USER))
})

test('ownership: another learner’s row and a missing row both read as 404', () => {
	for (const owner of [OTHER, null, undefined]) {
		assert.throws(
			() => assertOwnedBy(owner, USER),
			(error) => error instanceof AppError && error.status === 404
		)
	}
})

test('safeReturnTo: follows same-origin paths and keeps query and hash', () => {
	assert.equal(safeReturnTo('/practice/valid-anagram'), '/practice/valid-anagram')
	assert.equal(safeReturnTo('/progress?x=1#top'), '/progress?x=1#top')
})

test('safeReturnTo: rejects open redirects, auth pages and junk', () => {
	for (const bad of [
		'https://evil.example',
		'//evil.example',
		'/\\evil.example',
		'/%5Cevil',
		'javascript:alert(1)',
		'practice/two-sum',
		'/ok\nSet-Cookie: x',
		'/login',
		'/register/',
		'/login?next=/x',
		'',
		null,
		undefined
	]) {
		const result = safeReturnTo(bad)
		if (bad === '/%5Cevil')
			assert.equal(result, '/%5Cevil') // encoded, stays a path
		else assert.equal(result, '/dashboard', String(bad))
	}
})

test('authHref: carries a safe destination and drops an unsafe one', () => {
	assert.equal(authHref('login', '/practice/move-zeroes'), '/login?next=%2Fpractice%2Fmove-zeroes')
	assert.equal(authHref('register', '//evil.example'), '/register')
	assert.equal(authHref('login', null), '/login')
})

test('practiceAccess: only Two Sum is open to guests; learners open everything', () => {
	assert.equal(practiceAccess('two-sum', false), 'open')
	for (const slug of [
		'contains-duplicate',
		'valid-anagram',
		'move-zeroes',
		'binary-search',
		'valid-parentheses'
	]) {
		assert.equal(practiceAccess(slug, false), 'sign-in', slug)
		assert.equal(practiceAccess(slug, true), 'open', slug)
	}
})

test('headerNav: guests get Sign In + Register and no learner navigation', () => {
	const guest = headerNav(false)
	assert.deepEqual(guest.actions, ['signIn', 'register'])
	assert.equal(guest.links.includes('progress'), false)
	assert.equal((guest.actions as string[]).includes('bell'), false)
})

test('headerNav: learners get Progress, the bell and the account menu', () => {
	const learner = headerNav(true)
	assert.deepEqual(learner.links, ['how', 'problems', 'progress'])
	assert.deepEqual(learner.actions, ['bell', 'account'])
})
