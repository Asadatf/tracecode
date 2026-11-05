// Deploy-order safety: the `users` table gains columns in later migrations (profile
// settings, leaderboard consent). A query that reads the WHOLE row (no `select`) selects
// every column Prisma knows about, so it fails with a missing-column error if the code is
// deployed before its migration. Every `db.user` read or write must therefore name its
// columns, or be built by a query builder that does.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../../', import.meta.url).pathname

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name === '.next') continue
		const full = join(dir, name)
		if (statSync(full).isDirectory()) walk(full, out)
		else if (/\.(ts|tsx)$/.test(name)) out.push(full)
	}
	return out
}
const files = walk(SRC)
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// The argument text of a call that starts at `open` (the index of its "(").
function argumentOf(text: string, open: number): string {
	let depth = 0
	for (let i = open; i < text.length; i++) {
		if (text[i] === '(') depth += 1
		else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i)
	}
	return text.slice(open + 1)
}

describe('users table reads and writes name their columns', () => {
	it('every db.user call has a select, or is built by a query builder that has one', () => {
		const offenders: string[] = []
		for (const file of files) {
			if (/\.test\./.test(file)) continue
			const text = strip(readFileSync(file, 'utf8'))
			for (const match of text.matchAll(
				/db\.user\.(upsert|create|update|findUnique|findFirst|findMany|findUniqueOrThrow|findFirstOrThrow)\(/g
			)) {
				const arg = argumentOf(text, (match.index ?? 0) + match[0].length - 1)
				const viaBuilder = /^\s*\w+Query\(/.test(arg)
				if (!viaBuilder && !/\bselect\s*:/.test(arg))
					offenders.push(`${file.replace(SRC, '')}: db.user.${match[1]}`)
			}
		}
		assert.deepEqual(offenders, [])
	})

	it('the query builders those calls rely on do select', () => {
		const builders = strip(readFileSync(join(SRC, 'lib/profile/profile-queries.ts'), 'utf8'))
		assert.ok((builders.match(/select:/g) ?? []).length >= 3)
	})

	it('no include loads the whole user row', () => {
		const offenders = files.filter(
			(f) =>
				!/\.test\./.test(f) && /include:\s*\{\s*user:\s*true/.test(strip(readFileSync(f, 'utf8')))
		)
		assert.deepEqual(
			offenders.map((f) => f.replace(SRC, '')),
			[]
		)
	})

	it('provisioning a user (run on every learning write) reads only the id', () => {
		const provision = strip(readFileSync(join(SRC, 'server/auth/provision-user.ts'), 'utf8'))
		assert.match(provision, /select: \{ id: true \}/)
	})
})
