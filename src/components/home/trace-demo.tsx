import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/cn'
import type { TwoSumDemo } from '@/lib/home/two-sum-demo'

// The static step table beside the home hero (specs/features/home-page.md,
// AC4): the buggy Two Sum run, shown the way a debugger lists steps. No Python
// runs here; the rows come from the engine's committed trace.
export async function TraceDemo({ demo }: { demo: TwoSumDemo }) {
	const t = await getTranslations('TraceDemo')
	const columns = ['step', 'line', 'i', 'j', 'sum'] as const

	return (
		<figure
			aria-label={t('label')}
			className="border-border bg-surface m-0 min-w-0 flex-[1_1_460px] overflow-hidden rounded-sm border"
		>
			<figcaption className="border-border bg-surface-subtle flex flex-wrap justify-between gap-2 border-b px-4 py-2.5 text-sm">
				<code className="text-text font-mono">{demo.call}</code>
				<span className="text-danger font-semibold">
					{t('result', { expected: demo.expected, actual: demo.actual })}
				</span>
			</figcaption>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[26rem] border-collapse font-mono text-sm">
					<thead>
						<tr className="text-text-muted text-left">
							{columns.map((column) => (
								<th key={column} scope="col" className="px-4 py-2 font-normal">
									{t(`columns.${column}`)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{demo.rows.map((row) => (
							<tr
								key={row.step}
								className={cn(
									'border-border border-t',
									row.highlighted ? 'bg-danger-soft text-text' : 'text-text-muted'
								)}
							>
								<td className={cn('px-4 py-2', row.highlighted && 'border-l-danger border-l-4')}>
									{row.step}
								</td>
								<td className="px-4 py-2 whitespace-nowrap">{row.code}</td>
								<td className={cn('px-4 py-2', row.highlighted && 'font-bold')}>{row.i}</td>
								<td className={cn('px-4 py-2', row.highlighted && 'font-bold')}>{row.j}</td>
								<td className="px-4 py-2 whitespace-nowrap">{row.sum}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="border-border text-text-muted m-0 border-t px-4 py-2.5 text-sm">{t('note')}</p>
		</figure>
	)
}
