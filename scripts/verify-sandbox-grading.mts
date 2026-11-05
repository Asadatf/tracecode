// Opt-in LIVE check of the Vercel Sandbox grader (ADR-0007). It creates REAL sandboxes
// (a few seconds of Active CPU each, counted against the project's Sandbox quota), so it
// refuses to run without --confirm. It touches no database and no flag.
//
//   vercel link && vercel env pull .env.local      (local OIDC credentials)
//   pnpm exec node --import ./scripts/register-ts.mjs scripts/verify-sandbox-grading.mts --confirm
import { Sandbox } from '@vercel/sandbox'
import { createSandboxGrader } from '../src/lib/challenge/sandbox-grader.ts'
import { HIDDEN_SUITES } from '../src/server/challenge/hidden-suites.data.ts'
import { PROBLEMS } from '../src/lib/trace/problems.ts'

if (!process.argv.includes('--confirm')) {
	console.error('This creates real Vercel Sandboxes. Re-run with --confirm to proceed.')
	process.exit(2)
}

const grader = createSandboxGrader(
	async (options) => {
		const sandbox = await Sandbox.create(options)
		return {
			writeFiles: (files) => sandbox.writeFiles(files),
			runCommand: async ({ cmd, args, timeoutMs }) => {
				const finished = await sandbox.runCommand({ cmd, args, timeoutMs })
				return { exitCode: finished.exitCode, stdout: () => finished.stdout() }
			},
			stop: () => sandbox.stop()
		}
	},
	(slug) => {
		const problem = PROBLEMS[slug]
		const suite = HIDDEN_SUITES[slug]
		return problem == null || suite == null ? null : { problem, cases: suite.cases }
	}
)

const good = 'def contains_duplicate(nums):\n    return len(set(nums)) != len(nums)\n'
const wrong = 'def contains_duplicate(nums):\n    return False\n'
const network = [
	'import socket',
	'def contains_duplicate(nums):',
	'    try:',
	"        socket.create_connection(('1.1.1.1', 53), timeout=2)",
	'        return True',
	'    except Exception:',
	'        return False',
	''
].join('\n')
const total = HIDDEN_SUITES['contains-duplicate']!.cases.length
const falseAnswers = HIDDEN_SUITES['contains-duplicate']!.cases.filter(
	(c) => c.expected === false
).length

const checks: [string, string, (r: Awaited<ReturnType<typeof grader.grade>>) => boolean][] = [
	['correct solution passes everything', good, (r) => r.ok && r.testsPassed === total],
	['wrong solution fails some', wrong, (r) => r.ok && r.testsPassed < total],
	// Egress denied: the connection fails, so it answers False everywhere.
	['network is unreachable', network, (r) => r.ok && r.testsPassed === falseAnswers]
]
let failed = 0
for (const [name, source, check] of checks) {
	const result = await grader.grade({ problemSlug: 'contains-duplicate', source })
	const pass = check(result)
	if (!pass) failed += 1
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(result)}`)
}
process.exit(failed === 0 ? 0 : 1)
