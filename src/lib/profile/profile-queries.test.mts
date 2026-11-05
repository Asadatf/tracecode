import test from 'node:test'
import assert from 'node:assert/strict'
import {
	ownerSettingsQuery,
	publicProfileLookupQuery,
	updateProfileQuery
} from './profile-queries.ts'

const FORBIDDEN = ['email', 'attempts', 'source', 'notification', 'recommendation', 'adminMember']

test('the owner query is scoped to the session id and selects only the two settings', () => {
	const query = ownerSettingsQuery('user-1')
	assert.deepEqual(query.where, { id: 'user-1' })
	assert.deepEqual(Object.keys(query.select).sort(), ['profileVisibility', 'username'])
})

test('the update is scoped to the owner id and returns only the two settings', () => {
	const query = updateProfileQuery('user-1', { username: 'alice' })
	assert.deepEqual(query.where, { id: 'user-1' })
	assert.deepEqual(query.data, { username: 'alice' })
	assert.deepEqual(Object.keys(query.select).sort(), ['profileVisibility', 'username'])
})

test('the public lookup only ever matches PUBLIC profiles, by normalised username', () => {
	const query = publicProfileLookupQuery('  AliCe ')
	assert.deepEqual(query.where, { username: 'alice', profileVisibility: 'PUBLIC' })
})

test('the public lookup selects the id (server-side) and username, and nothing private', () => {
	const query = publicProfileLookupQuery('alice')
	assert.deepEqual(Object.keys(query.select).sort(), ['id', 'username'])
	const text = JSON.stringify(query)
	for (const word of FORBIDDEN) assert.equal(text.includes(word), false, word)
})
