import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { catalogSlugs, knowledgeFor, knownSlugs } from './problem-knowledge'

// Every problem in PROBLEMS must have curated knowledge (specs AC4). Growing
// the catalog without an entry is a CI failure, not a silent fallback.
describe('tutor problem knowledge', () => {
	it('covers every slug in PROBLEMS', () => {
		for (const slug of catalogSlugs()) {
			const k = knowledgeFor(slug)
			assert.ok(k != null, `missing knowledge for ${slug}`)
			assert.ok(k.coreConcepts.length > 0, `${slug}: core concepts required`)
			assert.equal(k.hintStrategy.length, 3, `${slug}: hint ladder must be L1/L2/L3`)
			assert.ok(k.straightforward.time.length > 0 && k.optimized.time.length > 0)
		}
	})

	it('does not cover unknown slugs', () => {
		assert.equal(knowledgeFor('not-a-real-problem'), null)
	})

	it('known slugs are a subset of (or equal to) catalog slugs', () => {
		const catalog = new Set(catalogSlugs())
		for (const slug of knownSlugs()) {
			assert.ok(catalog.has(slug), `stale knowledge entry for ${slug}`)
		}
	})
})
