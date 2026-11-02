import { getTranslations } from 'next-intl/server'
import { getUnreadCount } from '@/server/notifications/inbox'
import { NotificationBell, type BellLabels } from './notification-bell'

// Server half of the bell: renders nothing for a signed-out visitor, and the bell
// with its unread count for a signed-in learner. Wrapped in <Suspense> by the
// header so the count query never delays the rest of the page.
export async function NotificationBellSlot() {
	const [unread, t] = await Promise.all([getUnreadCount(), getTranslations('Notifications')])
	if (!unread.authenticated) return null
	const labels: BellLabels = {
		open: t('open'),
		unread: t('unread'),
		heading: t('heading'),
		markAll: t('markAll'),
		markRead: t('markRead'),
		empty: t('empty'),
		error: t('error'),
		loading: t('loading')
	}
	return <NotificationBell initialUnread={unread.count} labels={labels} />
}
