import 'server-only'
import type { SandboxFactory } from '@/lib/challenge/sandbox-grader'

// The Vercel Sandbox binding (ADR-0007). It is a thin, typed adapter: it only maps our
// narrow SandboxLike contract onto the SDK. Nothing here creates a sandbox until a
// submission is actually graded, and grading itself only runs when the
// `challenge_server_grading` flag is on (see grade.ts).
//
// Auth is the SDK's own: on Vercel it uses the project's OIDC token automatically; locally
// it needs `vercel link` + `vercel env pull`. No credential is read or passed here.

export async function loadSandboxFactory(): Promise<SandboxFactory | null> {
	try {
		// Lazy so the SDK is not loaded for any request that never grades.
		const { Sandbox } = await import('@vercel/sandbox')
		return async (options) => {
			const sandbox = await Sandbox.create({
				timeout: options.timeout,
				resources: options.resources,
				networkPolicy: options.networkPolicy,
				persistent: options.persistent
			})
			return {
				writeFiles: (files) => sandbox.writeFiles(files),
				runCommand: async ({ cmd, args, timeoutMs }) => {
					const finished = await sandbox.runCommand({ cmd, args, timeoutMs })
					return { exitCode: finished.exitCode, stdout: () => finished.stdout() }
				},
				stop: () => sandbox.stop()
			}
		}
	} catch {
		return null
	}
}
