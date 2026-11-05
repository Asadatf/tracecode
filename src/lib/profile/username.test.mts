import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import {
	RESERVED_USERNAMES,
	USERNAME_MAX,
	USERNAME_MIN,
	checkUsername,
	normalizeUsername
} from './username.ts'

const ok = (input: string) => {
	const result = checkUsername(input)
	assert.equal(result.ok, true, input)
	return result.ok ? result.username : ''
}
const error = (input: string) => {
	const result = checkUsername(input)
	assert.equal(result.ok, false, input)
	return result.ok ? '' : result.error
}

test('normalisation trims, lowercases and folds compatibility forms', () => {
	assert.equal(normalizeUsername('  Alice-Dev  '), 'alice-dev')
	assert.equal(normalizeUsername('ALICE'), 'alice')
	// Full-width letters fold to ASCII, so they cannot be a look-alike of another name.
	assert.equal(normalizeUsername('ＡＬＩＣＥ'), 'alice')
})

test('valid usernames are stored normalised', () => {
	assert.equal(ok('Alice'), 'alice')
	assert.equal(ok('  alice-99 '), 'alice-99')
	assert.equal(ok('a1b'), 'a1b')
	assert.equal(ok('ＡＬＩＣＥ'), 'alice')
})

test('case never makes a different username (case-insensitive by construction)', () => {
	assert.equal(ok('AliceDev'), ok('alicedev'))
	assert.equal(ok('ALICEDEV'), ok('aLiCeDeV'))
})

test('length is 3 to 30 characters after normalisation', () => {
	assert.equal(USERNAME_MIN, 3)
	assert.equal(USERNAME_MAX, 30)
	assert.equal(error(''), 'too_short')
	assert.equal(error('   '), 'too_short')
	assert.equal(error('ab'), 'too_short')
	assert.equal(ok('abc'), 'abc')
	assert.equal(ok('a'.repeat(30)), 'a'.repeat(30))
	assert.equal(error('a'.repeat(31)), 'too_long')
})

test('only lowercase letters, digits and hyphens are allowed', () => {
	for (const bad of [
		'has space',
		'under_score',
		'dot.name',
		'a/b',
		'a@b',
		'émile',
		'ab😀c',
		'../x',
		'a?b'
	]) {
		assert.equal(error(bad), 'invalid_chars', bad)
	}
})

test('hyphens may not start, end or double up', () => {
	assert.equal(error('-abc'), 'hyphen_edge')
	assert.equal(error('abc-'), 'hyphen_edge')
	assert.equal(error('a--b'), 'hyphen_double')
	assert.equal(ok('a-b-c'), 'a-b-c')
})

test('reserved names are rejected in any case', () => {
	for (const name of [
		'admin',
		'ADMIN',
		'Dashboard',
		'api',
		'settings',
		'login',
		'tracy',
		'tracecode',
		'u'
	]) {
		// 'u' is also too short, so it fails either way; the others are reserved.
		assert.equal(checkUsername(name).ok, false, name)
	}
	assert.equal(error('Admin'), 'reserved')
	assert.equal(error('tracecode'), 'reserved')
	assert.equal(error('settings'), 'reserved')
	assert.equal(ok('admin1'), 'admin1')
})

test('every reserved name is itself in normal form', () => {
	for (const name of RESERVED_USERNAMES) assert.equal(name, normalizeUsername(name), name)
})

// A route added without reserving its name would let someone claim it as a username
// and shadow, or be confused with, the page. Reading the app directory keeps the
// list honest: every route directory, and every metadata route file, is reserved.
test('every top-level route segment under src/app is reserved', () => {
	const appDir = new URL('../../app/', import.meta.url)
	const localeDir = new URL('../../app/[locale]/', import.meta.url)
	const names = new Set<string>()
	for (const dir of [appDir, localeDir]) {
		for (const entry of readdirSync(dir)) {
			// Dynamic ([locale], [...rest]) and private (_x) segments are not names.
			if (/^[[_(]/.test(entry)) continue
			if (statSync(new URL(entry, dir)).isDirectory()) names.add(entry)
		}
	}
	for (const file of readdirSync(appDir)) {
		const match =
			/^(robots|sitemap|manifest|icon|apple-icon|opengraph-image|llms|llms-full)\./.exec(file)
		if (match?.[1] != null) names.add(match[1])
	}
	assert.ok(names.size >= 8, 'found the routes')
	for (const name of names) {
		// Reserved, or not a valid username at all (a name with a dot, say).
		assert.equal(checkUsername(name).ok, false, `route "${name}" can be claimed as a username`)
	}
})
