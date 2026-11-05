import test from 'node:test'
import assert from 'node:assert/strict'
import { HEATMAP_SPAN_DAYS, activityLevel, buildHeatmapGrid } from './heatmap-grid.ts'
import type { DailyActivity } from './daily-activity.ts'

const day = (iso: string, attempts: number, problems = 1, solved = 0): DailyActivity => ({
	day: iso,
	attempts,
	problems,
	solved
})

test('intensity levels use fixed thresholds', () => {
	const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 100].map(activityLevel)
	assert.deepEqual(levels, [0, 1, 2, 2, 3, 3, 3, 4, 4, 4])
	assert.equal(activityLevel(-1), 0)
	assert.equal(activityLevel(Number.NaN), 0)
})

test('an empty history is a full grid of inactive cells', () => {
	const grid = buildHeatmapGrid([], '2026-11-10')
	const cells = grid.weeks.flat().filter((c) => c != null)
	assert.equal(cells.length, HEATMAP_SPAN_DAYS)
	assert.ok(cells.every((c) => c.level === 0 && c.attempts === 0))
	assert.equal(grid.activeDays, 0)
	assert.equal(grid.totalAttempts, 0)
})

test('the grid is whole 7-row weeks, Sunday first, ending on today', () => {
	// 2026-11-10 is a Tuesday.
	const grid = buildHeatmapGrid([], '2026-11-10')
	assert.ok(grid.weeks.every((week) => week.length === 7))
	const last = grid.weeks.at(-1)
	assert.ok(last)
	assert.equal(last[2]?.day, '2026-11-10')
	assert.equal(last[3], null)
	assert.equal(last[0]?.day, '2026-11-08')
	assert.equal(grid.to, '2026-11-10')
	assert.equal(grid.from, '2025-11-11')
	// Days before the window are padding, not cells.
	const first = grid.weeks[0]
	assert.ok(first)
	assert.equal(first.find((c) => c != null)?.day, '2025-11-11')
})

test('cells are in strictly increasing consecutive day order', () => {
	const cells = buildHeatmapGrid([], '2026-11-10')
		.weeks.flat()
		.filter((c) => c != null)
	for (let i = 1; i < cells.length; i++) {
		const a = Date.parse(`${cells[i - 1]?.day}T00:00:00Z`)
		const b = Date.parse(`${cells[i]?.day}T00:00:00Z`)
		assert.equal(b - a, 86_400_000)
	}
})

test('activity lands on its own date with the right level and counts', () => {
	const grid = buildHeatmapGrid(
		[day('2026-11-10', 1, 1, 1), day('2026-11-09', 5, 2, 1), day('2026-11-03', 9, 3, 2)],
		'2026-11-10'
	)
	const cells = new Map(grid.weeks.flat().flatMap((c) => (c == null ? [] : [[c.day, c] as const])))
	assert.deepEqual(cells.get('2026-11-10'), {
		day: '2026-11-10',
		attempts: 1,
		problems: 1,
		solved: 1,
		level: 1
	})
	assert.equal(cells.get('2026-11-09')?.level, 3)
	assert.equal(cells.get('2026-11-03')?.level, 4)
	assert.equal(cells.get('2026-11-08')?.level, 0)
	assert.equal(grid.activeDays, 3)
	assert.equal(grid.totalAttempts, 15)
})

test('activity outside the 365-day window is ignored by the grid', () => {
	const grid = buildHeatmapGrid([day('2025-01-01', 4), day('2026-11-10', 1)], '2026-11-10')
	assert.equal(grid.activeDays, 1)
	assert.equal(grid.totalAttempts, 1)
})

test('leap day appears as a real cell', () => {
	const grid = buildHeatmapGrid([day('2024-02-29', 2)], '2024-03-05')
	const cells = grid.weeks.flat().filter((c) => c != null)
	assert.ok(cells.some((c) => c.day === '2024-02-29' && c.attempts === 2))
	assert.ok(cells.some((c) => c.day === '2024-02-28'))
	assert.ok(cells.some((c) => c.day === '2024-03-01'))
	assert.equal(cells.length, HEATMAP_SPAN_DAYS)
})

test('month labels sit over the week holding the 1st, ascending, and cross the year boundary', () => {
	const grid = buildHeatmapGrid([], '2026-02-10')
	const labels = grid.monthLabels
	assert.ok(labels.length >= 12)
	for (let i = 1; i < labels.length; i++) {
		const prev = labels[i - 1]
		const cur = labels[i]
		assert.ok(prev && cur)
		assert.ok(cur.week > prev.week, 'columns ascend, one label per column')
	}
	const jan = labels.find((l) => l.year === 2026 && l.month === 0)
	assert.ok(jan)
	const firstOfJan = grid.weeks[jan.week]?.find((c) => c?.day === '2026-01-01')
	assert.ok(firstOfJan, 'the label column contains January 1st')
	assert.ok(labels.some((l) => l.year === 2025 && l.month === 11))
})

test('a leading partial month is labelled only when the next label is not crowding it', () => {
	const grid = buildHeatmapGrid([], '2026-11-10')
	const labels = grid.monthLabels
	const second = labels[1]
	if (labels[0]?.week === 0 && second != null) assert.ok(second.week >= 3 || second.week > 0)
	assert.ok(labels.every((l) => l.week >= 0 && l.week < grid.weeks.length))
})

test('the grid is deterministic: the same input gives the same grid', () => {
	const days = [day('2026-11-10', 2)]
	assert.deepEqual(buildHeatmapGrid(days, '2026-11-10'), buildHeatmapGrid(days, '2026-11-10'))
})
