import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROMPT_CATEGORIES } from '@/lib/tutor/prompt-categories'

// Pure-data assertions on the six-category guide, plus a source-level
// accessibility contract. Component rendering is not DOM-executed here
// (same pattern as the other tutor-view tests) — the accessibility
// guarantees ride on string matches against the component source.

const guideSrc = readFileSync(new URL('./tutor-prompt-guide.tsx', import.meta.url), 'utf8')
const panelSrc = readFileSync(new URL('./tutor-panel.tsx', import.meta.url), 'utf8')

describe('Tracy prompt guide — content', () => {
	it('exposes exactly the six categories the spec names', () => {
		assert.equal(PROMPT_CATEGORIES.length, 6)
		const ids = PROMPT_CATEGORIES.map((c) => c.id)
		assert.deepEqual(ids, [
			'learn-topic',
			'get-hint',
			'understand-failed-tests',
			'explore-execution',
			'optimize-solution',
			'review-solution'
		])
	})

	it('each example matches the exact wording in the clarification', () => {
		const byId = Object.fromEntries(PROMPT_CATEGORIES.map((c) => [c.id, c.example]))
		assert.equal(
			byId['learn-topic'],
			'Teach me the main concept behind this problem from first principles, with a small example.'
		)
		assert.equal(
			byId['get-hint'],
			'Give me a conceptual hint about my current approach without revealing the solution.'
		)
		assert.equal(
			byId['understand-failed-tests'],
			'Why are my tests failing? Explain using my current code and actual test results.'
		)
		assert.equal(
			byId['explore-execution'],
			'Explain my selected replay step and what the variables tell us.'
		)
		assert.equal(
			byId['optimize-solution'],
			'Explain the time and space complexity of my approach, then guide me toward an optimization without writing the code.'
		)
		assert.equal(
			byId['review-solution'],
			'Review my current solution for correctness, edge cases, and readability.'
		)
	})

	it('each category has a Copy affordance in the component', () => {
		// The Copy button renders once per category inside <GuideItem />.
		assert.match(
			guideSrc,
			/aria-label=\{copied \? `Copied \$\{category\.label\} prompt` : `Copy \$\{category\.label\} prompt`\}/
		)
		assert.match(guideSrc, /navigator\.clipboard\.writeText\(category\.example\)/)
	})

	it('explains that Practice context is attached only on send', () => {
		assert.match(guideSrc, /Tracy automatically receives the relevant Practice context/)
		// Prettier wraps the line, so match across whitespace/newlines.
		assert.match(guideSrc, /Nothing is\s+transmitted until then/)
	})
})

describe('Tracy prompt guide — accessibility & isolation', () => {
	it('is a modal dialog with a labelled heading', () => {
		assert.match(guideSrc, /role="dialog"/)
		assert.match(guideSrc, /aria-modal="true"/)
		assert.match(guideSrc, /aria-labelledby="tutor-guide-title"/)
	})

	it('closes on Escape and traps Tab inside the dialog', () => {
		assert.match(guideSrc, /event\.key === 'Escape'/)
		assert.match(guideSrc, /onClose\(\)/)
		assert.match(guideSrc, /event\.key !== 'Tab'/)
	})

	it('focuses the heading on open and restores focus to the trigger on close', () => {
		assert.match(guideSrc, /titleRef\.current\?\.focus\(\)/)
		assert.match(guideSrc, /document\.getElementById\(anchorId\)\?\.focus\(\)/)
	})

	it('trigger in the panel header is an info button with correct ARIA', () => {
		assert.match(panelSrc, /id="tutor-guide-trigger"/)
		assert.match(panelSrc, /aria-expanded=\{guideOpen\}/)
		assert.match(panelSrc, /aria-controls="tutor-guide-panel"/)
		assert.match(panelSrc, /aria-haspopup="dialog"/)
		// Default label reads as "How to ask Tracy" when closed.
		assert.match(panelSrc, /aria-label=\{guideOpen \? 'Close prompt guide' : 'How to ask Tracy'\}/)
	})

	it('opening the guide does NOT send a message or call the API', () => {
		// The trigger toggles a local useState; it never calls fetch, never
		// invokes tutor.send, never touches /api/tutor.
		assert.match(panelSrc, /setGuideOpen\(\(o\) => !o\)/)
		assert.doesNotMatch(guideSrc, /fetch\(/)
		assert.doesNotMatch(guideSrc, /\/api\/tutor/)
		assert.doesNotMatch(guideSrc, /tutor\.send/)
	})

	it('the guide is rendered OUTSIDE the conversation list', () => {
		// It must not live in TutorConversation nor emit a chat message.
		const convSrc = readFileSync(new URL('./tutor-conversation.tsx', import.meta.url), 'utf8')
		assert.doesNotMatch(convSrc, /TutorPromptGuide/)
		assert.doesNotMatch(convSrc, /PROMPT_CATEGORIES/)
	})
})
