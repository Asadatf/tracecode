'use client'

import { Link } from '@/i18n/routing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRightIcon, LightbulbIcon, RefreshIcon, SpinnerIcon } from '@/components/ui/icons'
import { useInsightRefresh } from '@/components/progress/use-insight-refresh'
import { insightSummary } from '@/lib/learning/summary-topics'
import type { ReasonCode, Recommendation } from '@/lib/learning/recommend'
import styles from './dashboard.module.css'

export interface NextLabels {
	insight: string
	upNext: string
	start: string
	continue: string
	open: string
	aiTag: string
	refresh: string
	refreshing: string
	statuses: { up_to_date: string; cooldown: string; running: string; failed: string }
}

export interface NextProblem {
	title: string
	tags: string[]
}

const ACTION_FOR_REASON: Record<ReasonCode, 'start' | 'continue' | 'open'> = {
	not_attempted: 'start',
	open_repeated_failures: 'continue',
	in_progress: 'continue',
	solved_revision: 'open'
}

// The dashboard's "What to practise next" body (dashboard-page AC19): one
// insight card (summary, the next problem with its topics, Start) and the
// refresh link under it. A refresh swaps the whole block, so the problem and
// button follow the new recommendation. Problem titles and topics come from
// the server as plain data keyed by slug.
export function PracticeNextInsight({
	initial,
	canRefresh,
	labels,
	problems,
	topicsBySlug
}: {
	initial: Recommendation
	canRefresh: boolean
	labels: NextLabels
	problems: Record<string, NextProblem>
	topicsBySlug: Record<string, string>
}) {
	const { recommendation, status, pending, refresh } = useInsightRefresh(initial)
	const { diagnosis } = recommendation
	const top = recommendation.rankedProblems[0]
	const next = top == null ? undefined : problems[top.slug]

	return (
		<>
			<div className={styles.insight}>
				<div className={styles.insightHead}>
					<LightbulbIcon size={20} />
					<span>{labels.insight}</span>
					{diagnosis.source === 'ai' ? <span className={styles.aiTag}>{labels.aiTag}</span> : null}
					{canRefresh ? (
						<button
							type="button"
							className={styles.refresh}
							onClick={refresh}
							disabled={pending}
							aria-label={labels[pending ? 'refreshing' : 'refresh']}
							title={labels.refresh}
						>
							{pending ? <SpinnerIcon size={18} /> : <RefreshIcon size={18} />}
						</button>
					) : null}
				</div>
				{status != null ? (
					<span role="status" className={styles.refreshStatus}>
						{labels.statuses[status]}
					</span>
				) : null}
				<p className={styles.insightText}>{insightSummary(diagnosis.summary, topicsBySlug)}</p>
				{top != null && next != null ? (
					<div className={styles.upNext}>
						<span className={styles.upNextLabel}>{labels.upNext}</span>
						<strong className={styles.upNextTitle}>{next.title}</strong>
						<div className={styles.chips}>
							{next.tags.map((tag) => (
								<Badge key={tag} variant="secondary">
									{tag}
								</Badge>
							))}
						</div>
					</div>
				) : null}
				<div className={styles.insightFoot}>
					{top != null ? (
						<Button asChild size="sm">
							<Link href={`/practice/${top.slug}`}>
								{labels[ACTION_FOR_REASON[top.reasonCode]]}
								<ArrowRightIcon className="size-4" />
							</Link>
						</Button>
					) : (
						<span />
					)}
				</div>
			</div>
		</>
	)
}
