import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	INACTIVE_AFTER_DAYS,
	latestAttemptAt,
	parseReminderPlan,
	planReminder,
	practicePath,
	reminderCopy,
	reminderPlanSchema,
	type CatalogProblem
} from './reminder-plan.ts'
import { rankRecommendations } from './recommend.ts'
import { HASHMAP, NESTED, SET_BASED, at, att, buildFor, type Spec } from './evidence-fixtures.mts'
import { PROBLEMS } from '../trace/problems.ts'

// M7.5B — the shared reminder planner: pure, deterministic, evidence-grounded.

// The original two-problem catalog, pinned (see evidence-fixtures.mts).
const CATALOG: CatalogProblem[] = [PROBLEMS['two-sum']!, PROBLEMS['contains-duplicate']!].map(
	(p) => ({
		slug: p.slug,
		title: p.title,
		conceptTags: p.conceptTags
	})
)
const DAY = 24 * 60 * 60 * 1000

function planFor(specs: Spec[], now: Date, catalog = CATALOG) {
	const { evidence } = buildFor(specs)
	return planReminder(rankRecommendations(evidence), evidence, catalog, now)
}

const OPEN_FAILURES = [
	att('a1', 0, 'fail', NESTED),
	att('a2', 4, 'fail', NESTED),
	att('a3', 8, 'fail', NESTED)
]
const soon = at(10)

test('no attempts yet → cold_start, pointing at the accessible top pick', () => {
	const plan = planFor([], soon)
	assert.ok(plan)
	assert.equal(plan.template, 'cold_start')
	assert.equal(plan.reasonCode, 'not_attempted')
	assert.ok(PROBLEMS[plan.problemSlug])
	assert.equal(plan.inactiveDays, null)
})

test('an open run of failures → unfinished, with factual copy', () => {
	const plan = planFor(OPEN_FAILURES, soon)
	assert.ok(plan)
	assert.equal(plan.template, 'unfinished')
	assert.equal(plan.problemSlug, 'two-sum')
	assert.equal(plan.reasonCode, 'open_repeated_failures')
	assert.match(reminderCopy(plan, 'Two Sum').body, /didn’t pass every test/)
})

test('one failed attempt → unfinished (in progress)', () => {
	const plan = planFor([att('a1', 0, 'fail', NESTED)], soon)
	assert.equal(plan?.template, 'unfinished')
	assert.equal(plan?.reasonCode, 'in_progress')
	assert.match(reminderCopy(plan!, 'Two Sum').body, /started Two Sum/)
})

test('a solved problem with an untouched one left → new_problem for the untouched one', () => {
	const plan = planFor([att('a1', 0, 'pass', HASHMAP)], soon)
	assert.equal(plan?.template, 'new_problem')
	assert.equal(plan?.problemSlug, 'contains-duplicate')
})

test('everything solved → revision, never a pretend new problem', () => {
	const plan = planFor(
		[
			att('a1', 0, 'pass', HASHMAP),
			att('c1', 1, 'pass', SET_BASED, { slug: 'contains-duplicate' })
		],
		at(5)
	)
	assert.equal(plan?.template, 'revision')
	assert.equal(plan?.reasonCode, 'solved_revision')
	assert.match(reminderCopy(plan!, 'X').body, /solved every problem/)
})

test(`a learner away ${INACTIVE_AFTER_DAYS}+ days → returning, with the observed day count`, () => {
	const latest = at(8).getTime()
	const plan = planFor(OPEN_FAILURES, new Date(latest + 4 * DAY + 60_000))
	assert.equal(plan?.template, 'returning')
	assert.equal(plan?.inactiveDays, 4)
	assert.match(reminderCopy(plan!, 'Two Sum').body, /4 days ago/)
	// The boundary: exactly the threshold counts as returning; one day less doesn't.
	assert.equal(
		planFor(OPEN_FAILURES, new Date(latest + INACTIVE_AFTER_DAYS * DAY))?.template,
		'returning'
	)
	assert.equal(
		planFor(OPEN_FAILURES, new Date(latest + (INACTIVE_AFTER_DAYS - 1) * DAY))?.template,
		'unfinished'
	)
})

test('latestAttemptAt finds the newest attempt across problems, or null', () => {
	const { evidence } = buildFor([
		att('a1', 0, 'fail', NESTED),
		att('c1', 30, 'fail', SET_BASED, { slug: 'contains-duplicate' })
	])
	assert.equal(latestAttemptAt(evidence)?.toISOString(), at(30).toISOString())
	assert.equal(latestAttemptAt(buildFor([]).evidence), null)
})

test('an invalid problem reference produces no plan (never a 404 link)', () => {
	const withoutTwoSum = CATALOG.filter((p) => p.slug !== 'two-sum')
	assert.equal(planFor(OPEN_FAILURES, soon, withoutTwoSum), null)
	assert.equal(planFor(OPEN_FAILURES, soon, []), null)
})

test('the concept is a focus concept the recommended problem actually carries', () => {
	const plan = planFor(OPEN_FAILURES, soon)
	assert.ok(plan?.conceptTag)
	assert.ok(PROBLEMS['two-sum']?.conceptTags.includes(plan.conceptTag))
})

test('plans are deterministic, schema-valid and round-trip; junk does not parse', () => {
	const a = planFor(OPEN_FAILURES, soon)
	const b = planFor([...OPEN_FAILURES].reverse(), soon)
	assert.deepEqual(a, b)
	assert.ok(reminderPlanSchema.safeParse(a).success)
	assert.deepEqual(parseReminderPlan(JSON.parse(JSON.stringify(a))), a)
	assert.equal(parseReminderPlan({ v: 1, template: 'nope' }), null)
	assert.equal(parseReminderPlan(null), null)
	assert.equal(parseReminderPlan({ ...a, extra: 'free text' }), null, 'strict: no extra fields')
})

test('the practice link is the real practice route', () => {
	assert.equal(practicePath('two-sum'), '/practice/two-sum')
})

test('no template makes a mastery, ability, speed or complexity claim', () => {
	const banned =
		/master|skill|talent|smart|genius|understand|complexity|\bO\(|faster|slower|optimal|efficien|lazy|fail(ed|ure)? (you|as)/i
	const plans = [
		planFor([], soon),
		planFor(OPEN_FAILURES, soon),
		planFor([att('a1', 0, 'fail', NESTED)], soon),
		planFor([att('a1', 0, 'pass', HASHMAP)], soon),
		planFor(OPEN_FAILURES, new Date(at(8).getTime() + 10 * DAY))
	]
	for (const plan of plans) {
		assert.ok(plan)
		const copy = reminderCopy(plan, 'Two Sum')
		for (const text of [copy.title, copy.body, copy.cta, copy.concept ?? '']) {
			assert.doesNotMatch(text, banned, text)
		}
	}
})
