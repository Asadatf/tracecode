// The form's wiring and copy contract. The test runner has no DOM, so (like the other
// a11y tests) this reads the source and the messages and pins what matters: every
// message the form uses exists, errors are announced, and the controls are labelled
// and disabled while saving.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTranslator } from 'next-intl'
import { USERNAME_ERRORS } from '../../lib/profile/username.ts'

const src = readFileSync(new URL('./public-profile-form.tsx', import.meta.url), 'utf8')
const messages = JSON.parse(
	readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8')
)
const t = createTranslator({
	locale: 'en',
	messages,
	namespace: 'SettingsPage.publicProfile'
})
const page = readFileSync(new URL('../../app/[locale]/settings/page.tsx', import.meta.url), 'utf8')

describe('PublicProfileForm', () => {
	it('every static message key it uses exists', () => {
		const keys = [...src.matchAll(/\bt\('([A-Za-z.]+)'/g)].map((m) => m[1] ?? '')
		assert.ok(keys.length >= 8)
		for (const key of keys) {
			assert.doesNotThrow(() => t(key as never, { min: 3, max: 30 }), key)
			assert.notEqual(t(key as never, { min: 3, max: 30 }), key)
		}
	})

	it('has a message for every error the server or the browser can return', () => {
		for (const code of [
			...USERNAME_ERRORS,
			'taken',
			'username_required',
			'unauthenticated',
			'failed'
		]) {
			assert.equal(typeof messages.SettingsPage.publicProfile.errors[code], 'string', code)
		}
	})

	it('explains what public means and that email, code and Tracy stay private', () => {
		const help = String(messages.SettingsPage.publicProfile.publicHelp)
		for (const word of ['email', 'code', 'Tracy', 'Off unless you turn it on']) {
			assert.ok(help.includes(word), word)
		}
	})

	it('is a labelled form whose controls are disabled while saving, with announced errors', () => {
		assert.match(src, /<form onSubmit=\{onSubmit\}/)
		assert.match(src, /htmlFor="profile-username"/)
		assert.match(src, /aria-describedby=/)
		assert.match(src, /aria-invalid=/)
		assert.match(src, /role="alert"/)
		assert.match(src, /role="status"/)
		assert.ok((src.match(/disabled=\{pending\}/g) ?? []).length >= 2)
		assert.match(src, /disabled=\{!dirty \|\| pending\}/)
	})

	it('sends no user id and never trusts the browser for the owner', () => {
		assert.doesNotMatch(src, /userId/)
		assert.match(src, /updateProfileSettingsAction/)
	})

	it('is shown on Settings only when the settings could be read', () => {
		assert.match(page, /profile\.authenticated && profile\.available/)
		assert.match(page, /PublicProfileForm/)
	})
})
