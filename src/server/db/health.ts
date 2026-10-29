import { db } from './client'

// Whether the database answers, for GET /api/health.
// Here beside the client because a health check has no person to query as. A
// ping the route stops waiting for still ends on its own when the pool gives up
// on it (Prisma's pool_timeout), so a slow database never stacks them up.
export async function pingDatabase(): Promise<void> {
	// Prisma has no other way to ask "does the database answer" than a query.
	await db.$queryRaw`select 1`
}
