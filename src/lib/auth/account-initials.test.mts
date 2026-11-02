import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountInitials } from './account-initials'

test('settings-navigation AC2: email initials and neutral missing-account fallback', () => {
	assert.equal(accountInitials('ada.lovelace@example.com'), 'AL')
	assert.equal(accountInitials('learner@example.com'), 'L')
	assert.equal(accountInitials('  @example.com'), '?')
	assert.equal(accountInitials(null), '?')
	assert.equal(accountInitials('éloïse.test@example.com'), 'ÉT')
})
