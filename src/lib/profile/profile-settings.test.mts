import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	isUsernameTakenError,
	planProfileUpdate,
	profileSettingsInput,
	type ProfileSettings
} from './profile-settings.ts'

const none: ProfileSettings = { username: null, visibility: 'PRIVATE' }
const named: ProfileSettings = { username: 'alice', visibility: 'PRIVATE' }
const live: ProfileSettings = { username: 'alice', visibility: 'PUBLIC' }

test('the input accepts only username and visibility; any other key is rejected', () => {
	assert.equal(profileSettingsInput.safeParse({ username: 'alice' }).success, true)
	assert.equal(profileSettingsInput.safeParse({ visibility: 'PUBLIC' }).success, true)
	assert.equal(profileSettingsInput.safeParse({}).success, true)
	for (const forged of [
		{ userId: 'someone-else', username: 'alice' },
		{ id: 'x' },
		{ email: 'a@b.c' },
		{ username: 'alice', role: 'admin' }
	]) {
		assert.equal(profileSettingsInput.safeParse(forged).success, false, JSON.stringify(forged))
	}
	assert.equal(profileSettingsInput.safeParse({ visibility: 'EVERYONE' }).success, false)
	assert.equal(profileSettingsInput.safeParse({ visibility: 'public' }).success, false)
	assert.equal(profileSettingsInput.safeParse({ username: 42 }).success, false)
})

test('setting a valid username stores it normalised and changes nothing else', () => {
	assert.deepEqual(planProfileUpdate(none, { username: '  Alice ' }), {
		ok: true,
		change: { username: 'alice' }
	})
})

test('invalid and reserved usernames are rejected with a specific error', () => {
	assert.deepEqual(planProfileUpdate(none, { username: 'ab' }), { ok: false, error: 'too_short' })
	assert.deepEqual(planProfileUpdate(none, { username: 'Admin' }), { ok: false, error: 'reserved' })
	assert.deepEqual(planProfileUpdate(none, { username: 'a b c' }), {
		ok: false,
		error: 'invalid_chars'
	})
})

test('changing a username never changes visibility', () => {
	assert.deepEqual(planProfileUpdate(named, { username: 'bob' }), {
		ok: true,
		change: { username: 'bob' }
	})
	// A private profile stays private; a public one stays public.
	const renamedPublic = planProfileUpdate(live, { username: 'bob' })
	assert.deepEqual(renamedPublic, { ok: true, change: { username: 'bob' } })
})

test('a profile is private unless the owner explicitly makes it public', () => {
	assert.deepEqual(planProfileUpdate(none, { username: 'alice' }), {
		ok: true,
		change: { username: 'alice' }
	})
	assert.deepEqual(planProfileUpdate(named, { visibility: 'PUBLIC' }), {
		ok: true,
		change: { profileVisibility: 'PUBLIC' }
	})
})

test('public needs a username: now or in the same request', () => {
	assert.deepEqual(planProfileUpdate(none, { visibility: 'PUBLIC' }), {
		ok: false,
		error: 'username_required'
	})
	assert.deepEqual(planProfileUpdate(none, { username: 'alice', visibility: 'PUBLIC' }), {
		ok: true,
		change: { username: 'alice', profileVisibility: 'PUBLIC' }
	})
	// An invalid username in the same request blocks the whole change.
	assert.deepEqual(planProfileUpdate(none, { username: 'x', visibility: 'PUBLIC' }), {
		ok: false,
		error: 'too_short'
	})
})

test('going private is always allowed, with or without a username', () => {
	assert.deepEqual(planProfileUpdate(live, { visibility: 'PRIVATE' }), {
		ok: true,
		change: { profileVisibility: 'PRIVATE' }
	})
	assert.deepEqual(planProfileUpdate(none, { visibility: 'PRIVATE' }), { ok: true, change: {} })
})

test('re-saving the stored values is a no-op', () => {
	assert.deepEqual(planProfileUpdate(live, { username: 'Alice', visibility: 'PUBLIC' }), {
		ok: true,
		change: {}
	})
	assert.deepEqual(planProfileUpdate(named, {}), { ok: true, change: {} })
})

test('only a unique violation on the username column means "taken"', () => {
	assert.equal(isUsernameTakenError({ code: 'P2002', meta: { target: ['username'] } }), true)
	assert.equal(
		isUsernameTakenError({ code: 'P2002', meta: { target: 'users_username_key' } }),
		true
	)
	assert.equal(isUsernameTakenError({ code: 'P2002', meta: { target: ['email'] } }), false)
	assert.equal(isUsernameTakenError({ code: 'P2002' }), false)
	assert.equal(isUsernameTakenError({ code: 'P2003', meta: { target: ['username'] } }), false)
	assert.equal(isUsernameTakenError(new Error('P2002 username')), false)
	assert.equal(isUsernameTakenError(null), false)
})

test('schema: usernames are unique and every account, existing ones included, defaults PRIVATE', () => {
	const user = readFileSync(
		new URL('../../../prisma/schema/example.prisma', import.meta.url),
		'utf8'
	)
	assert.match(user, /username\s+String\?\s+@unique/)
	assert.match(user, /profileVisibility\s+ProfileVisibility\s+@default\(PRIVATE\)/)
	const profile = readFileSync(
		new URL('../../../prisma/schema/profile.prisma', import.meta.url),
		'utf8'
	)
	assert.match(profile, /enum ProfileVisibility \{\s*PRIVATE\s+PUBLIC\s*\}/)
	// PRIVATE is listed first and no value other than these two exists.
	assert.equal((profile.match(/^\t[A-Z]+$/gm) ?? []).length, 2)
})
