import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

// The session-log hook is Python, so its regression tests are too
// (.claude/hooks/test_extract_log.py). This runs them under `pnpm test` and CI
// so a change to what the hook redacts cannot land without them. Locally a
// machine with no Python skips; in CI that would let the redaction tests go
// silently unrun, so there it fails.
test('the session-log hook redacts secrets, emails and project refs', (context) => {
	const python = spawnSync('python3', ['--version'])
	if (python.error) {
		if (process.env.CI) assert.fail('python3 is required in CI to run the logging regression tests')
		return context.skip('python3 is not installed')
	}

	const result = spawnSync('python3', ['-B', '.claude/hooks/test_extract_log.py'], {
		encoding: 'utf8'
	})
	assert.equal(result.status, 0, result.stderr)
})
