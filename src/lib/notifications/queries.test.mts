import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	isWellFormedUnsubscribeToken,
	listNotificationsQuery,
	markAllReadQuery,
	markReadQuery,
	toNotificationView,
	unreadCountQuery,
	unsubscribeQuery,
	upsertPreferencesQuery
} from './queries.ts'
import { newUnsubscribeToken } from '../../server/notifications/tokens.ts'

// M7.5B — every inbox/preference query is scoped to the session learner, and the
// unsubscribe token can only ever turn email off.

const ME = '11111111-1111-1111-1111-111111111111'
const NOW = new Date('2026-11-02T10:00:00Z')

test('every read and write is filtered by the session user id', () => {
	assert.deepEqual(listNotificationsQuery(ME).where, { userId: ME })
	assert.deepEqual(unreadCountQuery(ME).where, { userId: ME, readAt: null })
	assert.deepEqual(markAllReadQuery(ME, NOW).where, { userId: ME, readAt: null })
	assert.deepEqual(upsertPreferencesQuery(ME, 't', {}).where, { userId: ME })
})

test('mark-as-read needs both the notification id AND the owner, so another learner’s id matches nothing', () => {
	const q = markReadQuery(ME, 'n-1', NOW)
	assert.deepEqual(q.where, { id: 'n-1', userId: ME, readAt: null })
	assert.deepEqual(q.data, { readAt: NOW })
})

test('the list is bounded and newest-first', () => {
	const q = listNotificationsQuery(ME)
	assert.ok(q.take > 0 && q.take <= 50)
	assert.deepEqual(q.orderBy[0], { createdAt: 'desc' })
})

test('preferences default to in-app ON and email OFF (explicit opt-in)', () => {
	const q = upsertPreferencesQuery(ME, 'tok', {})
	assert.equal(q.create.inAppEnabled, true)
	assert.equal(q.create.emailOptIn, false)
	assert.deepEqual(q.update, {}, 'an empty update changes nothing')
	const optIn = upsertPreferencesQuery(ME, 'tok', { emailOptIn: true })
	assert.deepEqual(optIn.update, { emailOptIn: true })
	const inAppOff = upsertPreferencesQuery(ME, 'tok', { inAppEnabled: false })
	assert.deepEqual(inAppOff.update, { inAppEnabled: false }, 'the channels are independent')
})

test('unsubscribe only ever turns email off, and never touches in-app', () => {
	assert.deepEqual(unsubscribeQuery('tok'), {
		where: { unsubscribeToken: 'tok' },
		data: { emailOptIn: false }
	})
})

test('unsubscribe tokens are 256-bit, unique-looking and strictly shaped', () => {
	const tokens = new Set(Array.from({ length: 200 }, () => newUnsubscribeToken()))
	assert.equal(tokens.size, 200)
	for (const t of tokens) assert.ok(isWellFormedUnsubscribeToken(t), t)
	assert.equal(isWellFormedUnsubscribeToken('short'), false)
	assert.equal(isWellFormedUnsubscribeToken(`${'a'.repeat(42)}=`), false)
	assert.equal(isWellFormedUnsubscribeToken(`${'a'.repeat(42)}'`), false)
	assert.equal(isWellFormedUnsubscribeToken(undefined), false)
})

const PLAN = {
	v: 1,
	template: 'new_problem',
	problemSlug: 'contains-duplicate',
	reasonCode: 'not_attempted',
	conceptTag: 'hashing',
	inactiveDays: null
}

test('a stored notification renders with a link to the real practice page', () => {
	const view = toNotificationView({ id: 'n', payload: PLAN, readAt: null, createdAt: NOW })
	assert.equal(view.href, '/practice/contains-duplicate')
	assert.equal(view.read, false)
	assert.match(view.body, /Contains Duplicate/)
	assert.equal(view.concept, 'Concept to focus on: hashing')
})

test('an invalid payload or an unknown problem never links to a missing page', () => {
	for (const payload of [{ junk: true }, null, { ...PLAN, problemSlug: 'retired-problem' }]) {
		const view = toNotificationView({ id: 'n', payload, readAt: NOW, createdAt: NOW })
		assert.equal(view.href, '/progress')
		assert.equal(view.read, true)
	}
})
