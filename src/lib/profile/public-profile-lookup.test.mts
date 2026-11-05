import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePublicProfile, type ProfileStore } from './profile-service.ts'

interface Row {
	id: string
	username: string | null
	visibility: 'PRIVATE' | 'PUBLIC'
}

// Behaves like the real lookup query: matches the normalised username AND PUBLIC.
function store(rows: Row[], fail = false): { store: ProfileStore; calls: string[] } {
	const calls: string[] = []
	return {
		calls,
		store: {
			findOwner: async () => null,
			update: async () => ({ username: null, profileVisibility: 'PRIVATE' }),
			findPublic: async (username) => {
				calls.push(username)
				if (fail) throw new Error('database down')
				const row = rows.find((r) => r.username === username && r.visibility === 'PUBLIC')
				return row == null ? null : { id: row.id, username: row.username }
			}
		}
	}
}

const rows: Row[] = [
	{ id: 'u1', username: 'alice', visibility: 'PUBLIC' },
	{ id: 'u2', username: 'bobby', visibility: 'PRIVATE' },
	{ id: 'u3', username: null, visibility: 'PRIVATE' }
]

test('a public profile resolves to its owner, in any letter case', async () => {
	const { store: s } = store(rows)
	for (const typed of ['alice', 'ALICE', ' Alice ']) {
		assert.deepEqual(await resolvePublicProfile(s, typed), {
			status: 'found',
			owner: { userId: 'u1', username: 'alice' }
		})
	}
})

test('private, nonexistent, unset and malformed all give the identical not_found', async () => {
	const { store: s } = store(rows)
	const results = await Promise.all(
		['bobby', 'nobody', 'x', '../admin', 'Admin', 'a b c', ''].map((n) =>
			resolvePublicProfile(s, n)
		)
	)
	for (const result of results) assert.deepEqual(result, { status: 'not_found' })
})

test('a private profile is indistinguishable from one that does not exist', async () => {
	const { store: s } = store(rows)
	assert.deepEqual(await resolvePublicProfile(s, 'bobby'), await resolvePublicProfile(s, 'zzzzz'))
})

test('malformed usernames never reach the store', async () => {
	const { store: s, calls } = store(rows)
	await resolvePublicProfile(s, '../etc/passwd')
	await resolvePublicProfile(s, 'ab')
	assert.deepEqual(calls, [])
})

test('turning a profile private makes it not_found at once', async () => {
	const live: Row[] = [{ id: 'u1', username: 'alice', visibility: 'PUBLIC' }]
	const { store: s } = store(live)
	assert.equal((await resolvePublicProfile(s, 'alice')).status, 'found')
	live[0]!.visibility = 'PRIVATE'
	assert.deepEqual(await resolvePublicProfile(s, 'alice'), { status: 'not_found' })
})

test('a storage failure is "unavailable", never an exception and never "not found"', async () => {
	const { store: s } = store(rows, true)
	assert.deepEqual(await resolvePublicProfile(s, 'alice'), { status: 'unavailable' })
	assert.deepEqual(await resolvePublicProfile(s, 'nobody'), { status: 'unavailable' })
})
