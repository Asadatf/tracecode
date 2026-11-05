// The installed SDK still has the shape our adapter (src/server/challenge/sandbox.ts)
// relies on. It only inspects the module: it NEVER calls Sandbox.create, so running the
// tests cannot create a sandbox or spend quota, whatever credentials are on the machine.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('the SDK exposes Sandbox.create and the instance methods the adapter calls', async () => {
	const { Sandbox } = await import('@vercel/sandbox')
	assert.equal(typeof Sandbox.create, 'function')
	for (const method of ['writeFiles', 'runCommand', 'stop'])
		assert.equal(typeof Sandbox.prototype[method as 'stop'], 'function', method)
})

test('the adapter forces no network, no persistence and passes no credential', () => {
	const source = readFileSync(
		new URL('../../server/challenge/sandbox.ts', import.meta.url),
		'utf8'
	).replace(/\/\/.*$/gm, '')
	assert.match(source, /networkPolicy: options\.networkPolicy/)
	assert.match(source, /persistent: options\.persistent/)
	assert.doesNotMatch(source, /token|teamId|projectId|process\.env|allow-all|env:/i)
})
