// Dev-only: seed due spaced reviews for one learner so the dashboard's
// "Due for review" card has something to show in a demo. Safe to re-run (upsert).
//   node --env-file=.env.local scripts/seed-review-demo.mjs <username-or-email> [--apply]
import { PrismaClient } from '@prisma/client'

const [identity] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const apply = process.argv.includes('--apply')
const db = new PrismaClient()
const DAY = 86_400_000
// [problemSlug, reviewsDone, days overdue (0 = due today)]
const SEEDS = [
	['two-sum', 0, 1],
	['contains-duplicate', 1, 0],
]

try {
	const user = await db.user.findFirst({
		where: { OR: [{ username: identity }, { email: identity }] },
		select: { id: true, username: true }
	})
	if (!user) throw new Error(`No user matching "${identity}"`)
	console.log('user', user)
	if (apply) {
		const today = new Date(new Date().toISOString().slice(0, 10))
		for (const [problemSlug, reviewsDone, overdue] of SEEDS) {
			const dueDay = new Date(today.getTime() - overdue * DAY)
			await db.problemReview.upsert({
				where: { userId_problemSlug: { userId: user.id, problemSlug } },
				create: { userId: user.id, problemSlug, reviewsDone, dueDay },
				update: { reviewsDone, dueDay, completedAt: null, remindedAt: null }
			})
			console.log('seeded', problemSlug, 'stage', reviewsDone + 1, 'due', dueDay.toISOString().slice(0, 10))
		}
	}
} finally {
	await db.$disconnect()
}
