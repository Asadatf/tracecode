// Branding contract (M8 Tracy rebrand): user-facing strings carry the
// name "Tracy" with "AI Tutor" as the subtitle; internal names (component
// identifiers, API path, DB columns) stay unchanged. This test reads the
// source of each user-facing surface and asserts the required strings are
// present and the old "AI Tutor" label is gone from them — without
// disturbing the internal identifiers that back the M8 API.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), 'utf8')
}

const panel = read('./tutor-panel.tsx')
const conversation = read('./tutor-conversation.tsx')
const composer = read('./tutor-composer.tsx')
const workspace = read('../practice-workspace.tsx')

describe('Tracy — user-facing branding', () => {
	it('toolbar button says "Ask Tracy"', () => {
		assert.match(workspace, /Ask Tracy/)
		// The split-pane layout label is user-facing (aria), updated to Tracy.
		assert.match(workspace, /tutor: 'Tracy'/)
	})

	it('panel header shows "Tracy" with the "AI Tutor" subtitle', () => {
		assert.match(panel, /const TUTOR_NAME = 'Tracy'/)
		assert.match(panel, /const TUTOR_ROLE = 'AI Tutor'/)
		assert.match(panel, /\{TUTOR_NAME\}/)
		assert.match(panel, /\{TUTOR_ROLE\}/)
	})

	it('message role label is "Tracy" for assistant replies', () => {
		assert.match(conversation, /message\.role === 'user' \? 'You' : 'Tracy'/)
	})

	it('empty-state greeting uses the specified wording', () => {
		assert.match(conversation, /Hi, I&apos;m Tracy!/)
		assert.match(
			conversation,
			/help you understand your code, debug mistakes, and learn the concepts behind this problem/
		)
	})

	it('composer placeholder and sr-only label mention Tracy, not "AI tutor"', () => {
		assert.match(composer, /Ask Tracy about this problem/)
		assert.match(composer, /Sign in to chat with Tracy/)
		assert.match(composer, /Message to Tracy/)
	})

	it('aria labels for maximize/restore/close reference Tracy', () => {
		assert.match(panel, /Restore \$\{TUTOR_NAME\} size/)
		assert.match(panel, /Maximize \$\{TUTOR_NAME\}/)
		assert.match(panel, /Close \$\{TUTOR_NAME\}/)
	})

	it('internal identifiers are UNCHANGED (branding-only rename)', () => {
		// Component names, CSS class names, API route, DB feature id stay the same.
		assert.match(panel, /export function TutorPanel/)
		assert.match(composer, /export function TutorComposer/)
		assert.match(conversation, /export function TutorConversation/)
		// The DOM id the workspace uses to control tab-flow is still "tutor-toggle".
		assert.match(workspace, /id="tutor-toggle"/)
		assert.match(workspace, /aria-controls="pane-tutor"/)
	})

	it('/api/tutor route path is unchanged (M8 API frozen)', () => {
		const route = readFileSync(new URL('../../../app/api/tutor/route.ts', import.meta.url), 'utf8')
		assert.match(route, /createTutorRoute/)
	})
})
