import test from 'node:test'
import assert from 'node:assert/strict'
import {
	lookupPublicProfile,
	toPublicProfileView,
	updateProfile,
	type OwnerRow,
	type ProfileStore
} from './profile-service.ts'

// An in-memory users table that behaves like Postgres where it matters: a unique
// index on username, rows default to PRIVATE with no username, and `findPublic`
// filters on PUBLIC exactly as the real query does.
interface Row extends OwnerRow {
	id: string
	email: string
}

function fakeStore(rows: Row[]) {
	const writes: { userId: string; change: object }[] = []
	const store: ProfileStore = {
		async findOwner(userId) {
			const row = rows.find((r) => r.id === userId)
			return row == null
				? null
				: { username: row.username, profileVisibility: row.profileVisibility }
		},
		async update(userId, change) {
			const row = rows.find((r) => r.id === userId)
			if (row == null) throw new Error('no row')
			if (
				change.username !== undefined &&
				rows.some((r) => r.id !== userId && r.username === change.username)
			) {
				throw Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['username'] } })
			}
			writes.push({ userId, change })
			Object.assign(row, change)
			return { username: row.username, profileVisibility: row.profileVisibility }
		},
		async findPublic(username) {
			const row = rows.find((r) => r.username === username && r.profileVisibility === 'PUBLIC')
			return row == null ? null : { id: row.id, username: row.username }
		}
	}
	return { store, writes }
}

const user = (id: string, over: Partial<Row> = {}): Row => ({
	id,
	email: `${id}@example.com`,
	username: null,
	profileVisibility: 'PRIVATE',
	...over
})

test('existing accounts are private with no username, and cannot be found', async () => {
	const { store } = fakeStore([user('a'), user('b')])
	assert.equal(await lookupPublicProfile(store, 'a'), null)
	assert.equal(await lookupPublicProfile(store, 'anything'), null)
	const result = await updateProfile('a', store, {})
	assert.deepEqual(result, { saved: true, username: null, visibility: 'PRIVATE' })
})

test('a signed-out request is refused and touches nothing', async () => {
	const { store, writes } = fakeStore([user('a')])
	const result = await updateProfile(null, store, { username: 'alice', visibility: 'PUBLIC' })
	assert.deepEqual(result, { saved: false, error: 'unauthenticated' })
	assert.equal(writes.length, 0)
})

test('an owner can only change their own row: the target is the session id', async () => {
	const rows = [user('a'), user('b', { username: 'bob' })]
	const { store, writes } = fakeStore(rows)
	await updateProfile('a', store, { username: 'alice' })
	assert.deepEqual(
		writes.map((w) => w.userId),
		['a']
	)
	assert.equal(rows[1]?.username, 'bob')
})

test('claiming a name stores it normalised and leaves the profile private', async () => {
	const rows = [user('a')]
	const { store } = fakeStore(rows)
	const result = await updateProfile('a', store, { username: '  Alice-Dev ' })
	assert.deepEqual(result, { saved: true, username: 'alice-dev', visibility: 'PRIVATE' })
	assert.equal(await lookupPublicProfile(store, 'alice-dev'), null)
})

test('usernames are unique case-insensitively, decided by the unique index', async () => {
	const { store } = fakeStore([user('a'), user('b')])
	assert.equal((await updateProfile('a', store, { username: 'Alice' })).saved, true)
	for (const attempt of ['alice', 'ALICE', ' aLiCe ']) {
		assert.deepEqual(await updateProfile('b', store, { username: attempt }), {
			saved: false,
			error: 'taken'
		})
	}
	// The owner re-saving their own name is not a conflict.
	assert.deepEqual(await updateProfile('a', store, { username: 'ALICE' }), {
		saved: true,
		username: 'alice',
		visibility: 'PRIVATE'
	})
})

test('two simultaneous claims: exactly one wins and the other gets "taken"', async () => {
	const { store } = fakeStore([user('a'), user('b')])
	const [first, second] = await Promise.all([
		updateProfile('a', store, { username: 'racer' }),
		updateProfile('b', store, { username: 'racer' })
	])
	assert.equal([first, second].filter((r) => r.saved).length, 1)
	assert.equal([first, second].filter((r) => !r.saved && r.error === 'taken').length, 1)
})

test('reserved and invalid names are rejected before any write', async () => {
	const { store, writes } = fakeStore([user('a')])
	assert.deepEqual(await updateProfile('a', store, { username: 'Settings' }), {
		saved: false,
		error: 'reserved'
	})
	assert.deepEqual(await updateProfile('a', store, { username: 'ab!c' }), {
		saved: false,
		error: 'invalid_chars'
	})
	assert.equal(writes.length, 0)
})

test('visibility: public needs a username, and only the owner flips it', async () => {
	const rows = [user('a')]
	const { store } = fakeStore(rows)
	assert.deepEqual(await updateProfile('a', store, { visibility: 'PUBLIC' }), {
		saved: false,
		error: 'username_required'
	})
	assert.equal(rows[0]?.profileVisibility, 'PRIVATE')
	assert.deepEqual(await updateProfile('a', store, { username: 'alice', visibility: 'PUBLIC' }), {
		saved: true,
		username: 'alice',
		visibility: 'PUBLIC'
	})
	assert.deepEqual(await updateProfile('a', store, { visibility: 'PRIVATE' }), {
		saved: true,
		username: 'alice',
		visibility: 'PRIVATE'
	})
})

test('renaming never changes visibility', async () => {
	const rows = [
		user('a', { username: 'alice', profileVisibility: 'PUBLIC' }),
		user('b', { username: 'bob' })
	]
	const { store } = fakeStore(rows)
	assert.equal((await updateProfile('a', store, { username: 'alicia' })).saved, true)
	assert.equal(rows[0]?.profileVisibility, 'PUBLIC')
	assert.equal((await updateProfile('b', store, { username: 'robert' })).saved, true)
	assert.equal(rows[1]?.profileVisibility, 'PRIVATE')
})

test('private profiles cannot be found; public ones can, case-insensitively', async () => {
	const { store } = fakeStore([
		user('a', { username: 'alice', profileVisibility: 'PUBLIC' }),
		user('b', { username: 'bobby', profileVisibility: 'PRIVATE' }),
		user('c')
	])
	assert.deepEqual(await lookupPublicProfile(store, 'ALICE'), { userId: 'a', username: 'alice' })
	assert.equal(await lookupPublicProfile(store, 'bobby'), null)
	assert.equal(await lookupPublicProfile(store, 'nobody'), null)
	// A private profile and a missing one are indistinguishable.
	assert.deepEqual(
		await lookupPublicProfile(store, 'bobby'),
		await lookupPublicProfile(store, 'nobody')
	)
})

test('malformed lookups return null without reaching the store', async () => {
	let calls = 0
	const store: ProfileStore = {
		findOwner: async () => null,
		update: async () => ({ username: null, profileVisibility: 'PRIVATE' }),
		findPublic: async () => {
			calls += 1
			return null
		}
	}
	for (const bad of ['', 'a', '../etc', 'Admin', 'a b', 'x'.repeat(40)]) {
		assert.equal(await lookupPublicProfile(store, bad), null, bad)
	}
	assert.equal(calls, 0)
})

test('a failure other than "taken" propagates instead of being swallowed', async () => {
	const { store } = fakeStore([user('a')])
	const broken: ProfileStore = {
		...store,
		update: async () => {
			throw new Error('connection lost')
		}
	}
	await assert.rejects(updateProfile('a', broken, { username: 'alice' }), /connection lost/)
})

test('the public view exposes the username and nothing else', () => {
	const view = toPublicProfileView({ userId: 'secret-internal-id', username: 'alice' })
	assert.deepEqual(view, { username: 'alice' })
	assert.equal(JSON.stringify(view).includes('secret-internal-id'), false)
})
