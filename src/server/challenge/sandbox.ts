import 'server-only'
import type {
	SandboxCreateOptions,
	SandboxFactory,
	SandboxLike
} from '@/lib/challenge/sandbox-grader'

// The loader for Vercel Sandbox (ADR-0007). The SDK is NOT a dependency yet, so the app
// builds without it and this returns null — which keeps competitive grading off by
// construction. The specifier is a variable and the import is marked ignored, so the
// bundler never tries to resolve a package that is not installed. Adding the dependency
// (after the platform has been verified) is the only change needed to make it available.

const SANDBOX_MODULE = '@vercel/sandbox'

export async function loadSandboxFactory(): Promise<SandboxFactory | null> {
	try {
		const mod: unknown = await import(
			/* webpackIgnore: true */ /* turbopackIgnore: true */ SANDBOX_MODULE
		)
		const Sandbox = (
			mod as { Sandbox?: { create?: (o: SandboxCreateOptions) => Promise<SandboxLike> } }
		).Sandbox
		const create = Sandbox?.create
		if (typeof create !== 'function') return null
		return (options) => create.call(Sandbox, options)
	} catch {
		return null
	}
}
