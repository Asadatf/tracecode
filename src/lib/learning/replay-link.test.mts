import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveAttemptDbId } from './replay-link.ts'

test('an attempt already saved links to its server id', async () => {
	assert.equal(await resolveAttemptDbId({ dbId: 'db-1' }), 'db-1')
})

test('regression: a replay snapshot with no dbId still links once the pending save lands', async () => {
	let finishSave!: (id: string) => void
	const saving = new Promise<string | undefined>((resolve) => {
		finishSave = resolve
	})
	// The snapshot a replay captured: dbId unset, the save still in flight.
	const snapshot = { saving }
	const linked = resolveAttemptDbId(snapshot)
	finishSave('db-2')
	assert.equal(await linked, 'db-2')
	assert.equal(snapshot.dbId, undefined, 'the snapshot itself is never updated')
})

test('a failed save falls back to no id instead of breaking the replay', async () => {
	assert.equal(await resolveAttemptDbId({ saving: Promise.resolve(undefined) }), undefined)
	assert.equal(
		await resolveAttemptDbId({ saving: Promise.reject(new Error('db down')) }),
		undefined
	)
})

test('a signed-out attempt (nothing was saved) and a missing attempt resolve to no id', async () => {
	assert.equal(await resolveAttemptDbId({}), undefined)
	assert.equal(await resolveAttemptDbId(undefined), undefined)
})
