import { pingDatabase } from '@/server/db/health'
import { log } from '@/server/lib/logger'

// The standard health endpoint for uptime checks (e.g. once a minute): 200 when every check passes, 503 when any
// fails. The URL is public, so the body names a failing check and never says
// why. Add a check here only if people using the app are broken without it.

const CHECK_TIMEOUT_MS = 2000

type Check = () => Promise<unknown>

const CHECKS: Record<string, Check> = {
	database: pingDatabase
}

async function run(name: string, check: Check): Promise<'ok' | 'fail'> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timedOut = new Promise<'fail'>((resolve) => {
		timer = setTimeout(() => {
			log.warn('health check timed out', { check: name, timeoutMs: CHECK_TIMEOUT_MS })
			resolve('fail')
		}, CHECK_TIMEOUT_MS)
	})
	try {
		return await Promise.race([check().then((): 'ok' => 'ok'), timedOut])
	} catch (error) {
		// The public body says only "fail"; the reason is for the logs.
		log.error('health check failed', { check: name, error })
		return 'fail'
	} finally {
		clearTimeout(timer)
	}
}

export async function GET() {
	const results = await Promise.all(
		Object.entries(CHECKS).map(async ([name, check]) => [name, await run(name, check)] as const)
	)
	const status = results.every(([, result]) => result === 'ok') ? 'ok' : 'fail'
	return Response.json(
		{ status, checks: Object.fromEntries(results) },
		{ status: status === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
	)
}
