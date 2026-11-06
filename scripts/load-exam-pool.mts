// Validate, and later load, a private Daily Exam problem pack (specs/features/daily-exam.md AC42,
// ADR-0011 §3). Pack files live ONLY in the git-ignored `private/exam-pool/`; this script prints
// counts and per-problem pass/fail by INDEX, never a title, slug, statement or case, so its output
// can be shared or logged without leaking the pool.
//
//   Validate (no database, no network):
//     node --import ./scripts/register-ts.mjs scripts/load-exam-pool.mts --validate [--runner local|sandbox]
//   Load (after the M10 migration, identity-checked, one transaction, real Sandbox validation first):
//     node --env-file=.env.local --import ./scripts/register-ts.mjs scripts/load-exam-pool.mts \
//       --load --runner sandbox --project <expected supabase project ref>
//
// `--runner local` runs the SAME runner program the Sandbox runs (src/lib/challenge/runner-program.ts)
// with `python3 -I` in a temporary directory: fine for validating our own reference and wrong
// solutions, but it is not isolated, so it is never used to grade learners and `--load` refuses it.
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createSandboxGrader, type SandboxFactory } from '../src/lib/challenge/sandbox-grader.ts'
import {
	checkPack,
	packProblemSchema,
	toProblemDefinition,
	type PackProblem
} from '../src/lib/exam/pool-pack.ts'
import { PROBLEMS } from '../src/lib/trace/problems.ts'

const POOL_DIR = join(process.cwd(), 'private', 'exam-pool')
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
	const i = args.indexOf(name)
	return i >= 0 ? args[i + 1] : undefined
}
const runnerKind = option('--runner') ?? 'local'
if (!flag('--validate') && !flag('--load')) {
	console.error('Pass --validate or --load.')
	process.exit(2)
}

// --- the runner --------------------------------------------------------------------------------

const localSandbox: SandboxFactory = async () => {
	const dir = mkdtempSync(join(tmpdir(), 'exam-pool-'))
	return {
		async writeFiles(files) {
			for (const f of files) writeFileSync(join(dir, f.path), f.content)
		},
		async runCommand({ cmd, args: cmdArgs, timeoutMs }) {
			return new Promise((resolve) => {
				const child = spawn(cmd, cmdArgs, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
				let out = ''
				child.stdout.on('data', (d: Buffer) => {
					out += d.toString()
				})
				const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
				child.on('close', (code) => {
					clearTimeout(timer)
					resolve({ exitCode: code ?? 1, stdout: async () => out })
				})
			})
		},
		async stop() {
			rmSync(dir, { recursive: true, force: true })
		}
	}
}

async function realSandbox(): Promise<SandboxFactory> {
	const { Sandbox } = await import('@vercel/sandbox')
	return async (options) => {
		const sandbox = await Sandbox.create(options)
		return {
			writeFiles: (files) => sandbox.writeFiles(files),
			runCommand: async ({ cmd, args: a, timeoutMs }) => {
				const done = await sandbox.runCommand({ cmd, args: a, timeoutMs })
				return { exitCode: done.exitCode, stdout: () => done.stdout() }
			},
			stop: () => sandbox.stop()
		}
	}
}

// --- validation --------------------------------------------------------------------------------

function readPack(): {
	problems: PackProblem[]
	schemaErrors: { problem: number; issues: number }[]
} {
	const files = readdirSync(POOL_DIR)
		.filter((f) => f.endsWith('.json'))
		.sort()
	const problems: PackProblem[] = []
	const schemaErrors: { problem: number; issues: number }[] = []
	files.forEach((file, i) => {
		const parsed = packProblemSchema.safeParse(
			JSON.parse(readFileSync(join(POOL_DIR, file), 'utf8'))
		)
		if (parsed.success) problems.push(parsed.data)
		else schemaErrors.push({ problem: i, issues: parsed.error.issues.length })
	})
	return { problems, schemaErrors }
}

async function validate(problems: PackProblem[], factory: SandboxFactory) {
	const results: { problem: number; ok: boolean; failures: string[] }[] = []
	for (const [i, p] of problems.entries()) {
		const problem = toProblemDefinition(p)
		const failures: string[] = []
		const gradeAgainst = async (
			cases: readonly { id: string; args: unknown[]; expected: unknown }[],
			source: string
		) => {
			const grader = createSandboxGrader(factory, () => ({ problem, cases }))
			return grader.grade({ problemSlug: p.slug, source })
		}
		for (const [r, ref] of p.referenceSolutions.entries()) {
			const hidden = await gradeAgainst(p.hiddenCases, ref.source)
			if (!hidden.ok) failures.push(`reference_${r}_grader_${hidden.code}`)
			else if (hidden.testsPassed !== hidden.testsTotal)
				failures.push(`reference_${r}_hidden_${hidden.testsPassed}/${hidden.testsTotal}`)
			const practice = await gradeAgainst(p.practiceTests, ref.source)
			if (!practice.ok || practice.testsPassed !== practice.testsTotal)
				failures.push(`reference_${r}_practice`)
			const examples = await gradeAgainst(
				p.examples.map((e, k) => ({ id: `e${k}`, args: e.args, expected: e.output })),
				ref.source
			)
			if (!examples.ok || examples.testsPassed !== examples.testsTotal)
				failures.push(`reference_${r}_examples`)
		}
		for (const [w, wrong] of p.wrongSolutions.entries()) {
			const hidden = await gradeAgainst(p.hiddenCases, wrong.source)
			if (hidden.ok && hidden.testsPassed === hidden.testsTotal)
				failures.push(`wrong_${w}_passes_hidden`)
		}
		// The starter must not pass (it is a placeholder, never a solution).
		const starter = await gradeAgainst(p.hiddenCases, p.starter)
		if (starter.ok && starter.testsPassed === starter.testsTotal)
			failures.push('starter_passes_hidden')
		results.push({ problem: i, ok: failures.length === 0, failures })
	}
	return results
}

// --- main --------------------------------------------------------------------------------------

const { problems, schemaErrors } = readPack()
const issues = checkPack(problems, new Set(Object.keys(PROBLEMS)))
console.log(
	`pack: ${problems.length + schemaErrors.length} file(s); schema-valid ${problems.length}`
)
for (const e of schemaErrors) console.log(`  problem #${e.problem}: ${e.issues} schema issue(s)`)
for (const issue of issues) console.log(`  problem #${issue.problem}: ${issue.code}`)
// Loading normally re-validates in the real Sandbox. `--allow-local-validation` accepts the local
// runner (the same runner program) when Sandbox credentials are not available on this machine; the
// audit row records it, and real Sandbox grading still runs for every exam.
if (flag('--load') && runnerKind !== 'sandbox' && !flag('--allow-local-validation')) {
	console.error('--load requires --runner sandbox, or --allow-local-validation.')
	process.exit(2)
}
const factory = runnerKind === 'sandbox' ? await realSandbox() : localSandbox
const results = await validate(problems, factory)
for (const r of results)
	console.log(`  problem #${r.problem}: ${r.ok ? 'valid' : `INVALID ${r.failures.join(', ')}`}`)
const allValid = schemaErrors.length === 0 && issues.length === 0 && results.every((r) => r.ok)
console.log(allValid ? `VALID: ${results.length} problem(s)` : 'INVALID: nothing would be loaded')
if (!allValid) process.exit(1)

if (flag('--load')) {
	const expected = option('--project')
	const url = process.env.DATABASE_URL
	const ref = url == null ? null : new URL(url).username.split('.').pop()
	if (expected == null || ref !== expected) {
		console.error('Refusing to load: --project does not match the database identity.')
		process.exit(2)
	}
	const { PrismaClient } = await import('@prisma/client')
	const db = new PrismaClient()
	try {
		const now = new Date()
		const inserted = await db.$transaction(async (tx) => {
			let count = 0
			for (const p of problems) {
				const contentHash = createHash('sha256')
					.update(
						JSON.stringify([
							p.statement,
							p.examples,
							p.practiceTests,
							p.hiddenCases,
							p.starter,
							p.entry
						])
					)
					.digest('hex')
				const existing = await tx.examProblem.findUnique({
					where: { slug: p.slug },
					select: { contentHash: true }
				})
				if (existing != null) {
					// Never silently change a problem that may already have been examined.
					if (existing.contentHash !== contentHash)
						throw new Error('content_changed_for_existing_problem')
					continue
				}
				await tx.examProblem.create({
					data: {
						slug: p.slug,
						title: p.title,
						statement: p.statement,
						examples: p.examples,
						practiceTests: p.practiceTests,
						starter: p.starter,
						entry: p.entry,
						hiddenCases: p.hiddenCases,
						referenceSolutions: p.referenceSolutions,
						status: 'eligible',
						validatedAt: now,
						contentHash
					}
				})
				count += 1
			}
			await tx.examAudit.create({
				data: {
					actorId: '00000000-0000-0000-0000-000000000000',
					action: 'pool_load',
					target: `${count} problem(s)`,
					reason: `${option('--reason') ?? 'pack load'}; validated with the ${runnerKind} runner`
				}
			})
			return count
		})
		console.log(`loaded ${inserted} new problem(s)`)
	} finally {
		await db.$disconnect()
	}
}
