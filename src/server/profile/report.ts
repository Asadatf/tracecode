import 'server-only'
import { captureError } from '@/lib/observability/capture-error'
import { log } from '@/server/lib/logger'

// Reports a failure the profile code turns into an "unavailable" state, so it is
// never silent: to error reporting, and as one structured log line (which is what a
// developer sees locally, where Sentry is off). The line carries only the error's
// class, Prisma code and the last line of its message, passed through the logger's
// redaction; never a connection string or a row.
export function reportProfileFailure(area: string, error: unknown): void {
	captureError(error, { area })
	const code = (error as { code?: unknown } | null)?.code
	const lastLine =
		error instanceof Error ? (error.message.split('\n').filter(Boolean).at(-1) ?? '') : ''
	log.error('profile data unavailable', {
		area,
		errorClass: error instanceof Error ? error.constructor.name : typeof error,
		code: typeof code === 'string' ? code : undefined,
		message: lastLine.slice(0, 200)
	})
}
