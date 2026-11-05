import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTranslator } from 'next-intl'

const messages = JSON.parse(
	readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8')
)
const t = createTranslator({ locale: 'en', messages, namespace: 'Activity' })

test('every Activity message the graph uses is present and valid ICU', () => {
	for (const key of [
		'heading',
		'gridLabel',
		'summary',
		'cellEmpty',
		'cellActive',
		'less',
		'more',
		'empty',
		'disclaimer',
		'unavailable',
		'loading'
	] as const) {
		assert.equal(typeof messages.Activity[key], 'string', key)
	}
})

test('the day summary reads correctly for none, one and many', () => {
	assert.equal(t('summary', { attempts: 0, days: 0 }), 'No practice in the last 12 months')
	assert.equal(t('summary', { attempts: 1, days: 1 }), '1 run on 1 day in the last 12 months')
	assert.equal(t('summary', { attempts: 12, days: 5 }), '12 runs on 5 days in the last 12 months')
})

test('a cell describes its date, runs, problems and solves', () => {
	assert.equal(t('cellEmpty', { date: 'Nov 3, 2026' }), 'Nov 3, 2026: no practice')
	assert.equal(
		t('cellActive', { date: 'Nov 3, 2026', attempts: 1, problems: 1, solved: 0 }),
		'Nov 3, 2026: 1 run on 1 problem, none solved'
	)
	assert.equal(
		t('cellActive', { date: 'Nov 3, 2026', attempts: 4, problems: 2, solved: 1 }),
		'Nov 3, 2026: 4 runs on 2 problems, 1 solved'
	)
})
