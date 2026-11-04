import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { openRouterSlug, OPENROUTER_SLUGS } from './models'

// Regression guard for the M8 pricing path. OpenAI's API serves `gpt-4o-mini`
// under its dated id `gpt-4o-mini-2024-07-18`, and sink.ts writes the SERVED
// model (not the requested one). Without both forms mapped, every tutor call
// would price as NULL — see models.ts for the full note.
describe('AI usage pricing — gpt-4o-mini aliases', () => {
	it('registers both the floating and the dated id', () => {
		assert.equal(OPENROUTER_SLUGS['gpt-4o-mini'], 'openai/gpt-4o-mini')
		assert.equal(OPENROUTER_SLUGS['gpt-4o-mini-2024-07-18'], 'openai/gpt-4o-mini')
	})

	it('resolves a served dated id to the same OpenRouter slug', () => {
		assert.equal(openRouterSlug('gpt-4o-mini-2024-07-18'), 'openai/gpt-4o-mini')
		assert.equal(openRouterSlug('gpt-4o-mini'), 'openai/gpt-4o-mini')
	})

	it('an unmapped served id returns null (priced as NULL downstream)', () => {
		assert.equal(openRouterSlug('gpt-4o-mini-99-99-99'), null)
	})
})
