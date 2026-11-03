import test from 'node:test'
import assert from 'node:assert/strict'
import { GRID_CELLS, dayIso, monthLayout, monthOf, shiftMonth } from './month-grid.ts'

test('monthOf reads a UTC day, 0-based month', () => {
	assert.deepEqual(monthOf('2026-11-03'), { year: 2026, month: 10 })
})

test('shiftMonth crosses year ends in both directions', () => {
	assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 })
	assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 })
})

test('every month fills exactly six week rows', () => {
	for (let month = 0; month < 12; month++) {
		const layout = monthLayout({ year: 2026, month }, 'en')
		assert.equal(layout.leading + layout.daysInMonth + layout.trailing, GRID_CELLS)
	}
})

test('November 2026 starts on a Sunday and has 30 days', () => {
	const layout = monthLayout({ year: 2026, month: 10 }, 'en')
	assert.equal(layout.leading, 0)
	assert.equal(layout.daysInMonth, 30)
	assert.equal(layout.title, 'November 2026')
	assert.equal(layout.weekdays.length, 7)
})

test('dayIso zero-pads and stays in UTC', () => {
	assert.equal(dayIso({ year: 2026, month: 0 }, 5), '2026-01-05')
})
