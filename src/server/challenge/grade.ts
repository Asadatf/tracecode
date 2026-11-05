import 'server-only'
import { PROBLEMS } from '@/lib/trace/problems'
import { getFlag } from '@/lib/flags/server'
import { createSandboxGrader } from '@/lib/challenge/sandbox-grader'
import type { Grader } from '@/lib/challenge/service'
import { HIDDEN_SUITES } from './hidden-suites'
import { loadSandboxFactory } from './sandbox'

// The server grader in effect, or null. Null — and therefore NO grading, so a final
// submission just waits as "grading pending" — unless BOTH the `challenge_server_grading`
// flag is on AND the Sandbox SDK is available. The flag defaults off everywhere, so until it is deliberately enabled
// (after live verification, ADR-0007) this is always null.
export async function activeGrader(): Promise<Grader | null> {
	const enabled = await getFlag('challenge_server_grading').catch(() => false)
	if (enabled !== true) return null
	const factory = await loadSandboxFactory()
	if (factory == null) return null
	return createSandboxGrader(factory, (slug) => {
		if (!Object.hasOwn(PROBLEMS, slug) || !Object.hasOwn(HIDDEN_SUITES, slug)) return null
		const problem = PROBLEMS[slug]
		const suite = HIDDEN_SUITES[slug]
		return problem == null || suite == null ? null : { problem, cases: suite.cases }
	})
}
