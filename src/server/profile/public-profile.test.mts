// Data isolation for the public profile. The test runner cannot import server-only
// modules or a database, so this pins the privacy wiring by reading the sources: the
// public data path must never use the session, never take a user id from a caller
// other than the resolved owner, and never select private fields.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Comments describe the rules (and name the things they forbid), so they are not code.
const stripComments = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (path: string) => stripComments(readFileSync(new URL(path, import.meta.url), 'utf8'))
const data = read('./public-profile.ts')
const page = read('../../app/[locale]/u/[username]/page.tsx')
const og = read('../../app/[locale]/u/[username]/opengraph-image.tsx')
const body = read('../../components/profile/public-profile-body.tsx')
const copy = read('../../components/profile/copy-profile-link.tsx')
const stats = read('../../lib/profile/public-profile-stats.ts')

describe('public profile data path', () => {
	it('never reads the session: it describes the profile owner, not the viewer', () => {
		for (const source of [data, page, og, body]) {
			assert.doesNotMatch(source, /currentUserIdSafe|currentLearnerId|currentAccountSafe/)
			assert.doesNotMatch(source, /supabase/i)
			assert.doesNotMatch(source, /@\/server\/auth\//)
		}
	})

	it('every query is keyed by the resolved owner id, never by request input', () => {
		// The only user id in a query is the one handed to loadStatsFor.
		const wheres = [...data.matchAll(/where: \{[^}]*\}/g)].map((m) => m[0])
		for (const where of wheres) assert.match(where, /userId/)
		assert.match(data, /loadStatsFor\(owner\.userId\)/)
		assert.doesNotMatch(data, /params|searchParams|headers\(|cookies\(/)
		// The exported loader takes the resolved owner, not a bare id string.
		assert.match(data, /export function loadPublicProfileStats\(\s*owner: PublicProfileOwner\s*\)/)
		assert.doesNotMatch(data, /export (async )?function loadStatsFor|export const loadStatsFor/)
	})

	it('never turns a failure into "unavailable" silently: it is reported', () => {
		const settings = read('./profile.ts')
		assert.match(settings, /reportProfileFailure\('profile-settings', error\)/)
		assert.match(data, /reportProfileFailure\('public-profile-stats', error\)/)
		assert.match(data, /reportProfileFailure\('public-profile-lookup', error\)/)
		assert.doesNotMatch(settings, /catch \{/)
		assert.doesNotMatch(data, /catch \{/)
		const report = read('./report.ts')
		assert.match(report, /captureError\(error, \{ area \}\)/)
		assert.match(report, /log\.error\(/)
		assert.doesNotMatch(report, /DATABASE_URL|DIRECT_URL|process\.env/)
	})

	it('has no write path at all: its store can only look a public profile up', () => {
		assert.match(data, /Pick<ProfileStore, 'findPublic'>/)
		assert.doesNotMatch(data, /\bupdate\b|findOwner|updateProfileQuery|ownerSettingsQuery/)
	})

	it('reads only what the profile shows, and no private tables', () => {
		for (const table of [
			'learningEvent',
			'replaySession',
			'attemptTestResult',
			'notification',
			'recommendation',
			'adminMember'
		]) {
			assert.equal(data.includes(`db.${table}`), false, table)
		}
		// Progress rows are selected by field (no source, no results), attempts only counted.
		assert.doesNotMatch(data, /select:\s*\{[^}]*\bsource\b/)
		assert.doesNotMatch(data, /db\.attempt\.findMany/)
		assert.match(data, /db\.attempt\.count/)
		assert.doesNotMatch(data, /email/)
	})

	it('the stats record is built from a closed set of fields', () => {
		assert.doesNotMatch(stats, /email|source|userId|tutor/i)
	})

	it('the page resolves before streaming, 404s every non-public case alike, and is noindex', () => {
		assert.match(page, /lookup\.status === 'not_found'\) notFound\(\)/)
		assert.match(page, /robotsFor\(true\)/)
		// Not found and unavailable share one generic head; no username is echoed there.
		assert.match(page, /lookup\.status !== 'found'\) return NOT_FOUND_METADATA/)
		assert.match(page, /<Suspense fallback=\{<ProfileSkeleton/)
	})

	it('client components receive only display values, never the owner or an id', () => {
		assert.match(page, /<CopyProfileLink url=\{url\} \/>/)
		assert.doesNotMatch(copy, /owner|userId/)
		assert.match(body, /<ActivityHeatmap days=\{stats\.days\} today=\{stats\.today\}/)
		assert.doesNotMatch(body, /<ActivityHeatmap[^>]*owner/)
	})

	it('the share card is the same plain brand image for anything that is not public', () => {
		assert.match(og, /lookup\.status !== 'found'/)
		assert.doesNotMatch(og, /email|userId/)
	})

	it('is read-only: no server action, form or mutation in the public profile', () => {
		for (const source of [page, body, copy, data]) {
			assert.doesNotMatch(
				source,
				/'use server'|<form|useMutation|db\.\w+\.(create|update|delete|upsert)/
			)
		}
	})
})
