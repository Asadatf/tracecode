import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROBLEMS } from './problems'
import {
	comparisonSentence,
	comparisonTarget,
	shownSolutions,
	solutionsAccess,
	stepLabel
} from './solutions'

// specs/features/solutions-tab.md

test('AC2–AC4: locked, then revealable after 3 failed runs, unlocked by a pass or a reveal', () => {
	assert.equal(solutionsAccess({ solved: false, failedRuns: 0, revealed: false }), 'locked')
	assert.equal(solutionsAccess({ solved: false, failedRuns: 2, revealed: false }), 'locked')
	assert.equal(solutionsAccess({ solved: false, failedRuns: 3, revealed: false }), 'can-reveal')
	assert.equal(solutionsAccess({ solved: false, failedRuns: 3, revealed: true }), 'unlocked')
	assert.equal(solutionsAccess({ solved: true, failedRuns: 0, revealed: false }), 'unlocked')
})

test('AC5: only passing solutions are shown, straightforward first, for every problem', () => {
	for (const slug of Object.keys(PROBLEMS)) {
		const shown = shownSolutions(slug)
		assert.ok(shown.length >= 2, slug)
		assert.ok(
			shown.every((s) => s.passes),
			`${slug}: no noncompliant solution is shown`
		)
		const firstOptimised = shown.findIndex((s) => s.kind === 'optimized')
		assert.ok(
			shown.slice(0, firstOptimised).every((s) => s.kind === 'straightforward'),
			slug
		)
		assert.ok(
			shown.slice(firstOptimised).every((s) => s.kind === 'optimized'),
			slug
		)
		assert.equal(comparisonTarget(slug)?.kind, 'optimized')
	}
	assert.ok(!shownSolutions('move-zeroes').some((s) => s.name.includes('noncompliant')))
	assert.deepEqual(shownSolutions('unknown-problem'), [])
})

test('AC8: a capped trace reads "more than 2,000 steps"', () => {
	assert.equal(stepLabel({ steps: 2000, truncated: true }), 'more than 2,000 steps')
	assert.equal(stepLabel({ steps: 1234, truncated: false }), '1,234 steps')
})

test('AC7: the sentence matches the gap', () => {
	assert.match(
		comparisonSentence({ steps: 900, truncated: false }, { steps: 100, truncated: false }),
		/about 9× as much work/
	)
	assert.match(
		comparisonSentence({ steps: 110, truncated: false }, { steps: 100, truncated: false }),
		/similar amount of work/
	)
	assert.match(
		comparisonSentence({ steps: 20, truncated: false }, { steps: 100, truncated: false }),
		/less work/
	)
	assert.match(
		comparisonSentence({ steps: 2000, truncated: true }, { steps: 100, truncated: false }),
		/more than 2,000 steps on this input, against 100 steps/
	)
	assert.match(
		comparisonSentence({ steps: 2000, truncated: true }, { steps: 2000, truncated: true }),
		/cannot be compared/
	)
})
