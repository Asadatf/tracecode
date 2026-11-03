import { getTranslations } from 'next-intl/server'
import { STREAK_ACTIVE_FROM } from '@/lib/streak/streak'
import { getStreakSummary } from '@/server/learning/progress'
import { StreakFlame, type StreakData, type StreakLabels } from './streak-flame'

// Server half of the flame: nothing for a signed-out visitor; for a learner, the
// streak derived from their saved attempts, or a neutral flame with no numbers
// when that cannot be read. Wrapped in <Suspense> by the shell so the query never
// delays the page.
export async function StreakSlot() {
	const [summary, t] = await Promise.all([getStreakSummary(), getTranslations('Streak')])
	if (!summary.authenticated) return null

	let data: StreakData | null = null
	let status = t('statusUnavailable')
	let hint = ''
	if (summary.available) {
		const { current, longest, active, today, activeDays } = summary
		data = {
			current,
			longest,
			active,
			today,
			activeDays,
			currentText: t('days', { count: current }),
			longestText: t('days', { count: longest })
		}
		status = active
			? t('statusActive', { count: current })
			: t('statusInactive', { count: current })
		if (active) hint = t('hintActive')
		else if (current > 0) hint = t('hintBuilding', { count: STREAK_ACTIVE_FROM - current })
		else hint = longest > 0 ? t('hintBroken') : t('hintStart')
	}

	const labels: StreakLabels = {
		heading: t('heading'),
		open: t('open'),
		status,
		unavailable: t('unavailable'),
		current: t('current'),
		longest: t('longest'),
		hint,
		previous: t('previous'),
		next: t('next'),
		practiced: t('practiced'),
		today: t('today'),
		dayPracticed: t('dayPracticed', { date: '{date}' }),
		utc: t('utc')
	}
	return <StreakFlame data={data} labels={labels} />
}
