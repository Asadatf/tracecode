// Wiring contract for spaced reviews. The runner cannot import server-only modules or
// a database, so this pins the safety properties by reading the sources (comments
// stripped, as they name the things they forbid).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(new URL(p, import.meta.url), 'utf8'))
const reviews = read('./reviews.ts')
const action = read('../actions/learning.ts')
const wiring = read('../notifications/review-reminders.ts')
const daily = read('../notifications/daily-reminders.ts')
const cron = read('../api/learning-reminders-cron.ts')
const card = read('../../components/reviews/due-reviews-card.tsx')
const callout = read('../../components/reviews/due-review-callout.tsx')
const skeleton = read('../../components/reviews/due-reviews-skeleton.tsx')
const page = read('../../app/[locale]/dashboard/page.tsx')
const schema = readFileSync(
	new URL('../../../prisma/schema/reviews.prisma', import.meta.url),
	'utf8'
)
const messages = JSON.parse(
	readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8')
)

describe('review tracking on save', () => {
	it('advances reviews only through the evidence gate, after the attempt is stored', () => {
		assert.match(action, /reviewEvidenceHolds\(problem, input, meaningful\)/)
		assert.ok(action.indexOf('writeWithOptionalColumns(') < action.indexOf('trackReviewPass('))
		// Nothing in the request supplies a review id, stage or date.
		assert.doesNotMatch(action, /input\.(stage|reviewId|dueDay)/)
	})

	it('can never fail or lose a submission: tracking errors are reported and swallowed', () => {
		assert.match(
			reviews,
			/catch \(error\) \{\s*captureError\(error, \{ area: 'review-tracking' \}\)/
		)
		assert.match(
			reviews,
			/export async function trackReviewPass\(\s*userId: string,\s*problemSlug: string,\s*attemptAt: Date\s*\): Promise<void>/
		)
	})

	it("judges a review at the stored attempt's own database-set time, never the processing clock or the browser", () => {
		assert.match(reviews, /recordReviewPass\(store, userId, problemSlug, attemptAt\)/)
		assert.doesNotMatch(reviews, /new Date\(\)\)\s*\n?\s*\}\s*catch/)
		assert.match(action, /select:\s*\{\s*id: true,\s*createdAt: true\s*\}/)
		assert.match(action, /trackReviewPass\(userId, input\.problemSlug, attempt\.createdAt\)/)
	})

	it('public profile data reads no review data', () => {
		const pub = read('../profile/public-profile.ts')
		assert.doesNotMatch(pub, /problemReview|review-/)
	})

	it('reads the queue for the session learner only', () => {
		assert.match(reviews, /currentUserIdSafe\(\)/)
		assert.match(reviews, /dueReviewsQuery\(userId, today\)/)
		assert.doesNotMatch(reviews, /params|searchParams|headers\(|cookies\(/)
	})

	it('degrades to "unavailable" rather than throwing, and reports why', () => {
		assert.match(reviews, /return \{ authenticated: true, available: false \}/)
		assert.match(reviews, /captureError\(error, \{ area: 'due-reviews' \}\)/)
	})
})

describe('review reminders', () => {
	it('are separate from the daily suggestion: own channel, own kind, own key', () => {
		assert.match(wiring, /REVIEW_EMAIL_CHANNEL/)
		assert.match(wiring, /REVIEW_REMINDER_KIND/)
		assert.match(wiring, /reviewLogicalKey\(date\)/)
		// The daily run is untouched by M9C.
		assert.doesNotMatch(daily, /review/i)
	})

	it('run after the daily reminders in the same cron and fail independently', () => {
		assert.ok(cron.indexOf('runDailyReminders()') < cron.indexOf('runReviewReminders()'))
		assert.match(cron, /area: 'review-reminders-cron'/)
	})

	it('never send when email is not configured, and make no AI call', () => {
		assert.match(wiring, /if \(!config\.enabled\) return null/)
		assert.doesNotMatch(wiring, /openrouter|anthropic|openai/i)
	})

	it('every query is keyed by a user id the server iterated over', () => {
		assert.doesNotMatch(wiring, /params|searchParams|headers\(|cookies\(/)
		assert.match(wiring, /userId,\s*problemSlug: \{ in:/)
	})

	it('log counts only, never addresses or ids', () => {
		const log = wiring.slice(wiring.indexOf("log.info('review reminders run'"))
		assert.doesNotMatch(log, /email:|userId|address/)
	})
})

describe('review UI', () => {
	it('has loading, empty, unavailable and populated states', () => {
		assert.match(skeleton, /aria-busy="true"/)
		assert.match(card, /!view\.available/)
		assert.match(card, /view\.items\.length === 0/)
		assert.match(card, /t\('start'\)/)
		assert.match(page, /<Suspense fallback=\{<DueReviewsSkeleton/)
	})

	it('shows title, topic, difficulty, stage and due or overdue status per item', () => {
		for (const needle of [
			'problem.title',
			'topicLabel',
			'DifficultyPill',
			"t('stage'",
			"t('overdue'",
			"t('dueToday')"
		]) {
			assert.ok(card.includes(needle), needle)
		}
	})

	it('"Start review" is a plain link to the existing practice workspace (no second editor)', () => {
		assert.match(card, /href=\{`\/practice\/\$\{item\.slug\}`\}/)
		assert.doesNotMatch(card, /<form|useMutation|'use client'|textarea/)
	})

	it('renders nothing for a signed-out visitor, and the callout only when something is due', () => {
		assert.match(card, /!view\.authenticated\) return null/)
		assert.match(callout, /view\.items\.length === 0\) return null/)
	})

	it('does not claim a review measures memory or retention', () => {
		const copy = JSON.stringify(messages.Dashboard.reviews)
		for (const word of [/remembered?/i.source, /retention/i.source, /mastery|mastered/i.source]) {
			const claimsIt = new RegExp(word, 'i').test(
				copy.replace(/does not measure what you remember/i, '')
			)
			assert.equal(claimsIt, false, word)
		}
		assert.match(copy, /does not measure what you remember/)
	})

	it('the recommendation engine and its cache are untouched by reviews', () => {
		for (const file of ['../learning/recommendation.ts', '../learning/recommendation-cache.ts']) {
			assert.doesNotMatch(read(file), /problemReview|dueReview|review-schedule/)
		}
	})
})

describe('review data model', () => {
	it('is one row per learner and problem, keyed so duplicates cannot exist', () => {
		assert.match(schema, /@@id\(\[userId, problemSlug\]\)/)
		assert.match(schema, /reviewsDone\s+Int\s+@default\(0\)/)
		assert.match(schema, /onDelete: Cascade/)
	})

	it('stores no score, no code and no free text', () => {
		const model = schema.slice(schema.indexOf('model ProblemReview'))
		assert.doesNotMatch(model, /score|mastery|source|payload|note|message|text/i)
	})
})
