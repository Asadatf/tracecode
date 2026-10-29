#!/usr/bin/env node
// Keeps the template repository free of session logs and agent worktrees.
//
// The template is handed to many engineers, and every project is generated
// from it, so whatever it tracks lands in every project's first commit. Session transcripts
// (.claude-logs/, .codex-logs/) belong to the project whose work they record,
// not to the template, and this check catches one committed here. An agent
// worktree under .claude/worktrees/ is machine-local state that `git add -A`
// can sweep in as an embedded repository.
//
// The template is identified by its repository (GITHUB_REPOSITORY in CI, the
// `origin` remote locally). A project generated from it has its own
// repository, so this check passes there without looking at anything, and the
// project commits its logs as usual.
//
// Usage: node scripts/check-template-clean.mjs [--root <dir>] [--template]
// --template treats the checkout as the template whatever its repository.
// Exit codes: 0 clean (or not the template), 1 something tracked that must not
// be, 2 could not run (no tracked files to read).

import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const TEMPLATE_REPOSITORY = '8xsocial/template-web'

const LOG_DIRS = ['.claude-logs', '.codex-logs']
// What a log directory may hold in the template: the note that explains it,
// and the placeholder that keeps the directory in a clone.
const ALLOWED_IN_LOG_DIR = new Set(['README.md', '.gitkeep'])
const WORKTREES_DIR = '.claude/worktrees'

/** Why a tracked path must not be in the template, or null when it may be. */
export function reasonToReject(path) {
	const segments = path.split('/')
	for (const dir of LOG_DIRS) {
		const index = segments.indexOf(dir)
		if (index === -1) continue
		const rest = segments.slice(index + 1)
		if (rest.length === 1 && ALLOWED_IN_LOG_DIR.has(rest[0])) return null
		return `a session log (${dir}/)`
	}
	if (path === WORKTREES_DIR || path.startsWith(`${WORKTREES_DIR}/`)) {
		return `an agent worktree (${WORKTREES_DIR}/)`
	}
	return null
}

/** The tracked paths that must not be in the template. */
export function findTemplateLeaks(trackedFiles) {
	return trackedFiles
		.map((path) => ({ path, reason: reasonToReject(path) }))
		.filter((leak) => leak.reason != null)
}

/** Whether `root` is the template's own repository, not a copy of it. */
export function isTemplateRepository({ githubRepository, originUrl }) {
	if (githubRepository) return githubRepository.toLowerCase() === TEMPLATE_REPOSITORY
	const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(originUrl ?? '')
	return match != null && match[1].toLowerCase() === TEMPLATE_REPOSITORY
}

function originUrlOf(root) {
	const result = spawnSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	})
	return result.status === 0 ? result.stdout.trim() : ''
}

function trackedFilesIn(root) {
	const result = spawnSync('git', ['-C', root, 'ls-files', '-z'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	})
	if (result.status !== 0) return []
	return result.stdout.split('\0').filter(Boolean)
}

function main() {
	const args = process.argv.slice(2)
	const rootIndex = args.indexOf('--root')
	const root = resolve(rootIndex === -1 ? '.' : args[rootIndex + 1])

	const forced = args.includes('--template')
	const githubRepository = process.env.GITHUB_REPOSITORY ?? ''
	if (!forced && !isTemplateRepository({ githubRepository, originUrl: originUrlOf(root) })) {
		console.log(
			`check-template-clean: this is a copy of the template, not ${TEMPLATE_REPOSITORY}; nothing to check.`
		)
		process.exit(0)
	}

	// A scan that reads nothing passes. Outside a git checkout there is nothing
	// tracked, and "clean" would be a claim about files never looked at.
	const trackedFiles = trackedFilesIn(root)
	if (trackedFiles.length === 0) {
		console.error('check-template-clean: found no tracked files; run it inside the git checkout.')
		process.exit(2)
	}

	const leaks = findTemplateLeaks(trackedFiles)
	if (leaks.length === 0) {
		console.log(
			`check-template-clean: the template tracks no session logs or worktrees (${trackedFiles.length} files checked).`
		)
		process.exit(0)
	}

	console.error(
		`check-template-clean: the template repository (${TEMPLATE_REPOSITORY}) must not track:`
	)
	for (const leak of leaks) console.error(`  ${leak.path}  — ${leak.reason}`)
	console.error(
		'\nUntrack them and keep your local copies with: git rm -r --cached <path>\n' +
			'A project generated from the template has its own repository, and commits its own logs as usual.'
	)
	process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
