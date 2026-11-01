import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import type { ProblemTable as ProblemTableData } from '@/lib/home/problem-rows'

// The home page's problem list (specs/features/home-page.md, AC6–AC8).
export async function ProblemTable({ table }: { table: ProblemTableData }) {
	const t = await getTranslations('ProblemTable')
	const columns = ['number', 'title', 'topics', 'difficulty', 'status'] as const

	return (
		<section
			id="problems"
			aria-labelledby="problems-heading"
			className="flex scroll-mt-6 flex-col gap-3"
		>
			<h2 id="problems-heading" className="text-text m-0 text-lg font-bold">
				{t('heading')}
			</h2>
			<div className="border-border bg-surface overflow-x-auto rounded-sm border">
				<table className="w-full min-w-[35rem] border-collapse text-sm">
					<thead>
						<tr className="bg-surface-subtle text-text-muted text-left">
							{columns.map((column) => (
								<th key={column} scope="col" className="px-4 py-2.5 font-semibold">
									{t(`columns.${column}`)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{table.rows.length === 0 ? (
							<tr className="border-border border-t">
								<td colSpan={columns.length} className="text-text-muted px-4 py-3">
									{t('empty')}
								</td>
							</tr>
						) : (
							table.rows.map((row) => (
								<tr key={row.slug} className="border-border border-t">
									<td className="text-text-muted w-12 px-4 py-3 font-mono">{row.number}</td>
									<td className="px-4 py-3">
										<Link
											href={`/practice/${row.slug}`}
											className="text-text hover:text-accent font-semibold"
										>
											{row.title}
										</Link>
									</td>
									<td className="text-text-muted px-4 py-3">{row.topics}</td>
									<td className="text-success w-28 px-4 py-3 font-semibold">
										{t(`difficulty.${row.difficulty}`)}
									</td>
									<td className="text-text-muted w-28 px-4 py-3">{t(`status.${row.status}`)}</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
			{table.tracked ? null : <p className="text-text-muted m-0 text-sm">{t('signIn')}</p>}
		</section>
	)
}
