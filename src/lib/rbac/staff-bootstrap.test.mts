import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seatRoleForEmail } from './staff-bootstrap'
import { LOWEST_ROLE } from './roles'

test('emails on a listed domain get the lowest admin seat', () => {
	assert.equal(seatRoleForEmail('lead@acme.com', 'acme.com'), LOWEST_ROLE)
	assert.equal(seatRoleForEmail('lead@acme.dev', 'acme.com, acme.dev'), LOWEST_ROLE)
})

test('the domain match is case-insensitive', () => {
	assert.equal(seatRoleForEmail('Someone@ACME.Com', 'acme.com'), LOWEST_ROLE)
	assert.equal(seatRoleForEmail('someone@acme.com', 'ACME.COM'), LOWEST_ROLE)
})

test('emails on any other domain get no seat', () => {
	assert.equal(seatRoleForEmail('user@gmail.com', 'acme.com'), null)
	assert.equal(seatRoleForEmail('a@notacme.com', 'acme.com'), null)
})

test('no domains configured means nobody is auto-seated', () => {
	assert.equal(seatRoleForEmail('lead@acme.com', undefined), null)
	assert.equal(seatRoleForEmail('lead@acme.com', ''), null)
	assert.equal(seatRoleForEmail('lead@acme.com', ' , '), null)
})

test('malformed emails get no seat and never throw', () => {
	assert.equal(seatRoleForEmail('nodomain', 'nodomain'), null)
	assert.equal(seatRoleForEmail('', 'acme.com'), null)
})
