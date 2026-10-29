import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findTemplateLeaks, isTemplateRepository, reasonToReject } from './check-template-clean.mjs'

const LOG = '.claude-logs/2026-09-24_10-00-00_abcd1234.md'

test('the log directory placeholders may stay, a session log may not', () => {
	assert.equal(reasonToReject('.claude-logs/.gitkeep'), null)
	assert.equal(reasonToReject('.codex-logs/README.md'), null)
	assert.match(reasonToReject(LOG), /session log/)
	assert.match(reasonToReject('.claude-logs/archive/README.md'), /session log/)
	assert.match(reasonToReject('.claude/worktrees/agent-1'), /worktree/)
	assert.equal(reasonToReject('src/app/page.tsx'), null)
})

test('findTemplateLeaks names only what must not be tracked', () => {
	const leaks = findTemplateLeaks(['README.md', '.claude-logs/.gitkeep', LOG])
	assert.deepEqual(
		leaks.map((leak) => leak.path),
		[LOG]
	)
})

test('the template is told apart from a project generated from it', () => {
	assert.equal(isTemplateRepository({ githubRepository: '8xsocial/template-web' }), true)
	assert.equal(isTemplateRepository({ githubRepository: 'pair-7/my-app' }), false)
	assert.equal(
		isTemplateRepository({ originUrl: 'git@github.com:8xsocial/template-web.git' }),
		true
	)
	assert.equal(
		isTemplateRepository({ originUrl: 'https://github.com/8xsocial/template-web' }),
		true
	)
	assert.equal(isTemplateRepository({ originUrl: 'https://github.com/pair-7/my-app.git' }), false)
	assert.equal(isTemplateRepository({ originUrl: '' }), false)
})
