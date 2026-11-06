import type { ProblemDefinition } from '../trace/problem'
import { buildGradingJob, judgeOutputs, parseRunnerStdout, type HiddenCaseLike } from './grading'
import { CASE_PY, RUNNER_PY, RUNNER_VERSION } from './runner-program'
import type { Grader } from './service'
import { failureCounts } from '../exam/failures'

// The sandbox grader (ADR-0007), independent of any particular sandbox product: it needs
// something that can create an isolated, network-less machine, write three files and run
// one command. It never executes learner code itself, and the hidden expected answers are
// never written to the machine: only inputs go in, and outputs come back to be judged HERE.

export interface SandboxCommandResult {
	exitCode: number
	stdout(): Promise<string>
}

export interface SandboxLike {
	writeFiles(files: { path: string; content: string | Uint8Array }[]): Promise<void>
	runCommand(input: {
		cmd: string
		args: string[]
		timeoutMs: number
	}): Promise<SandboxCommandResult>
	stop(): Promise<unknown>
}

export interface SandboxCreateOptions {
	timeout: number
	resources: { vcpus: number }
	// 'deny-all' blocks every egress, including DNS.
	networkPolicy: 'deny-all'
	persistent: false
}

export type SandboxFactory = (options: SandboxCreateOptions) => Promise<SandboxLike>

export const SANDBOX_TIMEOUT_MS = 2 * 60 * 1000
// The runner prints one small JSON line; anything bigger is not our runner's output.
export const MAX_RUNNER_STDOUT_CHARS = 2_000_000

export interface GradingSubject {
	problem: ProblemDefinition
	cases: readonly HiddenCaseLike[]
}

export function createSandboxGrader(
	createSandbox: SandboxFactory,
	resolve: (problemSlug: string) => GradingSubject | null
): Grader {
	return {
		async grade({ problemSlug, source }) {
			const subject = resolve(problemSlug)
			if (subject == null) return { ok: false, code: 'no_hidden_suite' }
			const job = buildGradingJob(subject.problem, source, subject.cases)
			let sandbox: SandboxLike | null = null
			try {
				sandbox = await createSandbox({
					timeout: SANDBOX_TIMEOUT_MS,
					resources: { vcpus: 1 },
					networkPolicy: 'deny-all',
					persistent: false
				})
				await sandbox.writeFiles([
					{ path: 'runner.py', content: RUNNER_PY },
					{ path: 'case.py', content: CASE_PY },
					{ path: 'job.json', content: JSON.stringify(job) }
				])
				const run = await sandbox.runCommand({
					cmd: 'python3',
					args: ['-I', 'runner.py'],
					timeoutMs: (job.caseTimeoutSeconds * job.cases.length + 20) * 1000
				})
				if (run.exitCode !== 0) return { ok: false, code: 'runner_failed' }
				const stdout = await run.stdout()
				if (stdout.length > MAX_RUNNER_STDOUT_CHARS) return { ok: false, code: 'runner_failed' }
				const outputs = parseRunnerStdout(stdout)
				const judged = judgeOutputs(outputs, subject.cases)
				if (!judged.ok) return { ok: false, code: judged.code }
				return {
					ok: true,
					testsPassed: judged.testsPassed,
					testsTotal: judged.testsTotal,
					graderVersion: RUNNER_VERSION,
					// Aggregate categories only (the exam shows and assesses them; M9 ignores them).
					failures: failureCounts(outputs, subject.cases)
				}
			} catch {
				return { ok: false, code: 'sandbox_unavailable' }
			} finally {
				await sandbox?.stop().catch(() => undefined)
			}
		}
	}
}
