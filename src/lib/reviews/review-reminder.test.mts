import test from 'node:test'
import assert from 'node:assert/strict'
import {
	MAX_ITEMS_NAMED,
	buildReviewReminder,
	parseReviewReminder,
	reviewLogicalKey,
	reviewReminderCopy
} from './review-reminder.ts'
import { renderReviewEmail } from '../notifications/email-template.ts'
import { toNotificationView } from '../notifications/queries.ts'

const titles = {
	'two-sum': 'Two Sum',
	'binary-search': 'Binary Search',
	'valid-anagram': 'Valid Anagram',
	'move-zeroes': 'Move Zeroes'
}
const concepts = { 'two-sum': 'hashing' }

test('nothing due means no reminder', () => {
	assert.equal(buildReviewReminder([]), null)
})

test('the most overdue reviews are named first, capped, with the rest as a count', () => {
	const reminder = buildReviewReminder([
		{ problemSlug: 'move-zeroes', reviewsDone: 0, dueDay: '2026-11-10' },
		{ problemSlug: 'two-sum', reviewsDone: 1, dueDay: '2026-11-08' },
		{ problemSlug: 'binary-search', reviewsDone: 2, dueDay: '2026-11-09' },
		{ problemSlug: 'valid-anagram', reviewsDone: 0, dueDay: '2026-11-11' }
	])
	assert.ok(reminder)
	assert.equal(reminder.total, 4)
	assert.equal(reminder.items.length, MAX_ITEMS_NAMED)
	assert.deepEqual(
		reminder.items.map((i) => [i.problemSlug, i.stage]),
		[
			['two-sum', 2],
			['binary-search', 3],
			['move-zeroes', 1]
		]
	)
})

test('the payload is closed and enum-only: it parses, and anything extra or free-text does not', () => {
	const ok = buildReviewReminder([{ problemSlug: 'two-sum', reviewsDone: 0, dueDay: '2026-11-11' }])
	assert.deepEqual(parseReviewReminder(ok), ok)
	assert.equal(parseReviewReminder({ ...ok, email: 'a@b.c' }), null)
	assert.equal(
		parseReviewReminder({ v: 1, total: 1, items: [{ problemSlug: 'x', stage: 9 }] }),
		null
	)
	assert.equal(parseReviewReminder(null), null)
})

test('a single review links straight to its problem; several go to the Overview', () => {
	const one = buildReviewReminder([
		{ problemSlug: 'two-sum', reviewsDone: 0, dueDay: '2026-11-11' }
	])!
	const single = reviewReminderCopy(one, titles, concepts)
	assert.equal(single.href, '/practice/two-sum')
	assert.match(single.body, /Review 1 of 3 for Two Sum is due/)
	assert.equal(single.concept, 'Topic: Hashing')
	const many = buildReviewReminder([
		{ problemSlug: 'two-sum', reviewsDone: 0, dueDay: '2026-11-11' },
		{ problemSlug: 'binary-search', reviewsDone: 0, dueDay: '2026-11-11' }
	])!
	const multi = reviewReminderCopy(many, titles)
	assert.equal(multi.href, '/dashboard')
	assert.equal(multi.title, '2 problems are due for review')
})

test('the words never claim retention, mastery or knowledge', () => {
	const reminder = buildReviewReminder([
		{ problemSlug: 'two-sum', reviewsDone: 1, dueDay: '2026-11-11' }
	])!
	const text = JSON.stringify([
		reviewReminderCopy(reminder, titles, concepts),
		reviewReminderCopy({ ...reminder, total: 5 }, titles)
	])
	for (const word of [
		/remember/i,
		/retain/i,
		/retention/i,
		/master/i,
		/forgot/i,
		/you know/i,
		/proven/i,
		/scientific/i
	]) {
		assert.doesNotMatch(text, word)
	}
})

test('review notifications have their own key, kind and render in the bell', () => {
	assert.equal(reviewLogicalKey('2026-11-12'), 'review:2026-11-12')
	const payload = buildReviewReminder([
		{ problemSlug: 'two-sum', reviewsDone: 0, dueDay: '2026-11-11' }
	])
	const view = toNotificationView({
		id: 'n1',
		kind: 'review_due',
		payload,
		readAt: null,
		createdAt: new Date('2026-11-12T15:00:00Z')
	})
	assert.equal(view.href, '/practice/two-sum')
	assert.equal(view.cta, 'Start review')
	// Unreadable payloads fall back safely and never link to a missing page.
	const broken = toNotificationView({
		id: 'n2',
		kind: 'review_due',
		payload: { nope: 1 },
		readAt: null,
		createdAt: new Date()
	})
	assert.equal(broken.href, '/dashboard')
	// A daily reminder (no kind given) still renders as before.
	const daily = toNotificationView({
		id: 'n3',
		payload: { nope: 1 },
		readAt: null,
		createdAt: new Date()
	})
	assert.equal(daily.title, 'Practice reminder')
})

test('the review email carries only titles and stages, escapes everything, and can be unsubscribed', () => {
	const reminder = buildReviewReminder([
		{ problemSlug: 'two-sum', reviewsDone: 0, dueDay: '2026-11-11' }
	])!
	const email = renderReviewEmail({
		reminder,
		titles: { 'two-sum': 'Two <b>Sum</b> & co' },
		concepts,
		appUrl: 'https://app.example',
		unsubscribeToken: 'a b/c'
	})
	assert.doesNotMatch(email.html, /<b>Sum<\/b>/)
	assert.match(email.html, /&lt;b&gt;/)
	assert.equal(email.practiceUrl, 'https://app.example/practice/two-sum')
	assert.match(email.unsubscribeUrl, /token=a%20b%2Fc/)
	assert.match(email.text, /Unsubscribe:/)
	for (const forbidden of ['source', 'password', 'code '])
		assert.equal(email.text.includes(forbidden), false, forbidden)
})
