import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import type { ProgressStatus, ProgressView } from '@/lib/progress/progress-view'
import { LocalTime } from '@/components/local-time'

// The signed-in sections of /progress (specs/features/progress-page.md, AC4–AC7).

const STATUS_CLASS: Record<ProgressStatus, string> = {
	solved: 'text-success font-semibold',
	attempted: 'text-warning font-semibold',
	not_started: 'text-text-muted'
}

const ACTION_KEY: Record<ProgressStatus, 'open' | 'continue' | 'start'> = {
	solved: 'open',
	attempted: 'continue',
	not_started: 'start'
}

const tableBox = 'border-border bg-surface overflow-x-auto rounded-sm border'
const headRow = 'bg-surface-subtle text-text-muted text-left'
const headCell = 'px-4 py-2.5 font-semibold'
const bodyRow = 'border-border border-t'
const cell = 'px-4 py-3'

export async function ProgressSections({ view }: { view: ProgressView }) {
	const t = await getTranslations('ProgressPage')
	const { summary } = view

	return (
		<>
			<dl className="m-0 flex flex-wrap gap-x-10 gap-y-3">
				<div className="flex flex-col gap-0.5">
					<dt className="text-text-muted text-sm">{t('summary.solved')}</dt>
					<dd className="m-0 text-2xl font-bold">
						{summary.solved}{' '}
						<span className="text-text-muted text-base font-medium">
							{t('summary.of', { total: summary.total })}
						</span>
					</dd>
				</div>
				<div className="flex flex-col gap-0.5">
					<dt className="text-text-muted text-sm">{t('summary.attempted')}</dt>
					<dd className="m-0 text-2xl font-bold">{summary.attempted}</dd>
				</div>
				<div className="flex flex-col gap-0.5">
					<dt className="text-text-muted text-sm">{t('summary.runs')}</dt>
					<dd className="m-0 text-2xl font-bold">{summary.runs}</dd>
				</div>
			</dl>

			<section aria-labelledby="progress-problems" className="flex flex-col gap-3">
				<h2 id="progress-problems" className="m-0 text-lg font-bold">
					{t('problems.heading')}
				</h2>
				<div className={tableBox}>
					<table className="w-full min-w-[40rem] border-collapse text-sm">
						<thead>
							<tr className={headRow}>
								<th scope="col" className={headCell}>
									{t('problems.columns.problem')}
								</th>
								<th scope="col" className={headCell}>
									{t('problems.columns.status')}
								</th>
								<th scope="col" className={headCell}>
									{t('problems.columns.best')}
								</th>
								<th scope="col" className={headCell}>
									{t('problems.columns.runs')}
								</th>
								<th scope="col" className={headCell}>
									{t('problems.columns.solved')}
								</th>
								<th scope="col" className={headCell}>
									<span className="sr-only">{t('problems.columns.action')}</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{view.problems.map((row) => (
								<tr key={row.slug} className={bodyRow}>
									<td className={cn(cell, 'font-semibold')}>{row.title}</td>
									<td className={cn(cell, STATUS_CLASS[row.status])}>
										{t(`problems.status.${row.status}`)}
									</td>
									<td className={cn(cell, 'font-mono')}>
										{row.best == null
											? t('none')
											: t('problems.best', { passed: row.best.passed, total: row.best.total })}
									</td>
									<td className={cn(cell, 'font-mono')}>{row.runs}</td>
									<td className={cn(cell, 'text-text-muted')}>
										{row.solvedAt == null ? t('none') : <LocalTime iso={row.solvedAt} dateOnly />}
									</td>
									<td className={cn(cell, 'text-right')}>
										<Link
											href={`/practice/${row.slug}`}
											className="text-accent hover:text-accent-hover font-semibold"
										>
											{t(`problems.action.${ACTION_KEY[row.status]}`)}
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<div className="flex flex-wrap items-start gap-8">
				<section
					aria-labelledby="progress-recent"
					className="flex min-w-0 flex-[999_1_560px] flex-col gap-3"
				>
					<h2 id="progress-recent" className="m-0 text-lg font-bold">
						{t('recent.heading')}
					</h2>
					{view.recent.length === 0 ? (
						<p className="text-text-muted m-0 text-sm">{t('recent.empty')}</p>
					) : (
						<>
							<div className={tableBox}>
								<table className="w-full min-w-[30rem] border-collapse text-sm">
									<thead>
										<tr className={headRow}>
											<th scope="col" className={headCell}>
												{t('recent.columns.problem')}
											</th>
											<th scope="col" className={headCell}>
												{t('recent.columns.result')}
											</th>
											<th scope="col" className={headCell}>
												{t('recent.columns.when')}
											</th>
										</tr>
									</thead>
									<tbody>
										{view.recent.map((run) => (
											<tr key={run.key} className={bodyRow}>
												<td className={cell}>{run.title}</td>
												<td
													className={cn(
														cell,
														'font-mono',
														run.allPassed ? 'text-success' : 'text-danger'
													)}
												>
													{t('recent.result', { passed: run.passed, total: run.total })}
												</td>
												<td className={cn(cell, 'text-text-muted')}>
													<LocalTime iso={run.at} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<p className="text-text-muted m-0 text-sm">{t('recent.note')}</p>
						</>
					)}
				</section>

				<section
					aria-labelledby="progress-topics"
					className="flex min-w-0 flex-[1_1_280px] flex-col gap-3"
				>
					<h2 id="progress-topics" className="m-0 text-lg font-bold">
						{t('topics.heading')}
					</h2>
					<div className={tableBox}>
						<table className="w-full border-collapse text-sm">
							<thead>
								<tr className={headRow}>
									<th scope="col" className={headCell}>
										{t('topics.columns.topic')}
									</th>
									<th scope="col" className={cn(headCell, 'text-right')}>
										{t('topics.columns.solved')}
									</th>
								</tr>
							</thead>
							<tbody>
								{view.topics.map((topic) => (
									<tr key={topic.topic} className={bodyRow}>
										<td className={cell}>{topic.topic}</td>
										<td className={cn(cell, 'text-right font-mono')}>
											{topic.solved}/{topic.total}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			</div>
		</>
	)
}
