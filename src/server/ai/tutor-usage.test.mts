// The tutor's usage accounting, end to end through the REAL tracker, extractor and
// pricing code (src/server/lib/ai-usage), with the database sink replaced by a
// recorder. This is the deterministic half of the AI usage check; it proves what a
// finished, cut-off or stopped stream records, but it does not write to a database.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createAiTracker, type AiUsageRow } from '../lib/ai-usage/track'
import { costMicroUsd } from '../lib/ai-usage/pricing'
import { openRouterSlug } from '../lib/ai-usage/models'
import { usageResponseForStream } from './openai-protocol'

async function track(final: Parameters<typeof usageResponseForStream>[0]): Promise<AiUsageRow> {
	const rows: AiUsageRow[] = []
	const trackAiCall = createAiTracker((row) => rows.push(row))
	await trackAiCall(
		{ provider: 'openai', feature: 'tutor_chat', model: 'gpt-4o-mini' },
		async () => {
			const response = usageResponseForStream(final)
			if (response == null) throw new Error('recorded as an error row')
			return response
		}
	).catch(() => {})
	assert.equal(rows.length, 1, 'exactly one row per stream')
	return rows[0]!
}

describe('tutor usage rows', () => {
	it('a finished reply with provider usage is an ok row with the real token counts', async () => {
		const row = await track({
			ok: true,
			model: 'gpt-4o-mini-2024-07-18',
			finish: 'complete',
			usage: { inputTokens: 1200, outputTokens: 310 }
		})
		assert.equal(row.status, 'ok')
		assert.equal(row.provider, 'openai')
		assert.equal(row.feature, 'tutor_chat')
		assert.equal(row.inputTokens, 1200)
		assert.equal(row.outputTokens, 310)
		// The SERVED (dated) model is what gets recorded, and it maps to a price.
		assert.equal(row.model, 'gpt-4o-mini-2024-07-18')
		assert.equal(openRouterSlug(row.model), 'openai/gpt-4o-mini')
	})

	it('real counts price to a real, non-null cost; no rate means NULL, never 0', async () => {
		const row = await track({
			ok: true,
			model: 'gpt-4o-mini-2024-07-18',
			finish: 'complete',
			usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 }
		})
		// Illustrative per-token rates ($0.15 / $0.60 per million): the arithmetic is
		// what is under test, the live rate card is checked by `pnpm check:ai-models`.
		const cost = costMicroUsd(row, { prompt: '0.00000015', completion: '0.0000006' })
		assert.equal(cost, 750_000)
		assert.equal(costMicroUsd(row, undefined), null)
	})

	it('a reply with no provider usage is NOT recorded as a free, finished call', async () => {
		const row = await track({ ok: true, model: 'gpt-4o-mini', finish: 'complete' })
		assert.equal(row.status, 'error')
		assert.equal(row.inputTokens, 0)
		assert.equal(row.outputTokens, 0)
	})

	it('a learner Stop is an error row with no tokens, nothing invented', async () => {
		const row = await track({ ok: true, model: 'gpt-4o-mini', finish: 'abort' })
		assert.equal(row.status, 'error')
		assert.equal(row.inputTokens + row.outputTokens, 0)
	})

	it('a cut-off or failed stream is an error row with no tokens', async () => {
		const row = await track({ ok: false })
		assert.equal(row.status, 'error')
		assert.equal(row.inputTokens + row.outputTokens, 0)
	})

	it('a stream that did report usage but was stopped keeps its real tokens', async () => {
		const row = await track({
			ok: true,
			model: 'gpt-4o-mini-2024-07-18',
			finish: 'abort',
			usage: { inputTokens: 900, outputTokens: 40 }
		})
		assert.equal(row.status, 'ok')
		assert.equal(row.inputTokens, 900)
		assert.equal(row.outputTokens, 40)
	})
})
