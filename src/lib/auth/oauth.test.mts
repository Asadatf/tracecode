import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	enabledProviders,
	oauthFailureMessage,
	oauthFailurePath,
	oauthRedirectTo
} from './oauth.ts'

// specs/features/oauth-sign-in.md

test('AC1, AC2: a provider shows only when its flag is exactly "true"', () => {
	assert.deepEqual(enabledProviders({}), [])
	assert.deepEqual(enabledProviders({ AUTH_GITHUB_ENABLED: 'true' }), ['github'])
	assert.deepEqual(enabledProviders({ AUTH_GOOGLE_ENABLED: 'true', AUTH_GITHUB_ENABLED: 'true' }), [
		'google',
		'github'
	])
	assert.deepEqual(enabledProviders({ AUTH_GOOGLE_ENABLED: '1', AUTH_GITHUB_ENABLED: 'yes' }), [])
})

test('AC3: the callback URL carries the destination and provider', () => {
	const url = new URL(oauthRedirectTo('http://localhost:3000', 'github', '/practice/two-sum'))
	assert.equal(url.origin, 'http://localhost:3000')
	assert.equal(url.pathname, '/api/auth/callback')
	assert.equal(url.searchParams.get('next'), '/practice/two-sum')
	assert.equal(url.searchParams.get('provider'), 'github')
})

test('AC6: an unsafe next never survives into the callback', () => {
	for (const unsafe of [
		'https://evil.example',
		'//evil.example',
		'javascript:alert(1)',
		'/login'
	]) {
		const url = new URL(oauthRedirectTo('http://localhost:3000', 'google', unsafe))
		assert.equal(url.searchParams.get('next'), '/dashboard', unsafe)
	}
	const none = new URL(oauthRedirectTo('http://localhost:3000', 'google', null))
	assert.equal(none.searchParams.get('next'), '/dashboard')
})

test('AC4: failures go back to sign-in with a message naming the provider', () => {
	assert.equal(oauthFailurePath('github'), '/login?oauth_error=github')
	assert.equal(oauthFailurePath('<script>'), '/login?oauth_error=unknown')
	assert.equal(
		oauthFailureMessage('google'),
		'Sign-in with Google was cancelled or failed. Try again or use email.'
	)
	assert.match(oauthFailureMessage('nope'), /Sign-in with that provider was cancelled/)
})
