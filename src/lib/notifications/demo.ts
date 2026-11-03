import type { NotificationView } from './queries'

// Hardcoded sample notifications so the bell can be reviewed with something in
// it. Development only: never shown in a production build, never written to the
// database, and marking one read only changes the open panel.
export const DEMO_NOTIFICATIONS_ENABLED = process.env.NODE_ENV !== 'production'

const NOW = Date.now()
const MINUTE_MS = 60_000

export const DEMO_NOTIFICATIONS: NotificationView[] = [
	{
		id: 'demo-reminder',
		title: 'Practice reminder',
		body: 'Contains Duplicate is a good next step: it builds on the hashing you used in Two Sum.',
		concept: 'Concept to focus on: hashing',
		href: '/practice/contains-duplicate',
		cta: 'Practice now',
		createdAt: new Date(NOW - 12 * MINUTE_MS).toISOString(),
		read: false
	},
	{
		id: 'demo-streak',
		title: 'Streak at risk',
		body: 'Complete a run today to keep your streak going.',
		concept: null,
		href: '/dashboard',
		cta: 'Open overview',
		createdAt: new Date(NOW - 3 * 60 * MINUTE_MS).toISOString(),
		read: false
	},
	{
		id: 'demo-solved',
		title: 'Problem solved',
		body: 'You passed every test on Two Sum. Review the replay to see where your pointers moved.',
		concept: null,
		href: '/practice/two-sum',
		cta: 'Review',
		createdAt: new Date(NOW - 26 * 60 * MINUTE_MS).toISOString(),
		read: true
	}
]
