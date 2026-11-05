// Accessibility and disclosure contract for the condensed replay and the validation-check summary.
// There is no DOM runner, so (like the other component tests) this reads the sources.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(new URL(p, import.meta.url), 'utf8'))
const replay = read('./replay-view.tsx')
const workspace = read('./practice-workspace.tsx')
// The results renderers live in their own file (shared by the finished and the live view).
const results = read('./results-panel.tsx')
const css = readFileSync(new URL('./practice.module.css', import.meta.url), 'utf8')

describe('the replay folds repeats by default and everything stays reachable', () => {
	it('uses the real condensing of the recorded trace, and starts folded', () => {
		assert.match(replay, /condenseTrace\(trace\)/)
		assert.match(replay, /useState\(false\)[\s\S]*?const \[openRuns/)
		assert.match(replay, /const \[full, setFull\] = useState\(false\)/)
	})

	it('shows the engine-derived summary, never invented text', () => {
		assert.match(replay, /describeRun\(/)
		assert.doesNotMatch(
			replay,
			/ai|llm|generate|guess/i.exec('')?.[0] ?? /fetch\(|askModel|callTutor/
		)
	})

	it('a fold is a real <button> with aria-expanded and aria-controls, so the keyboard works', () => {
		const folds = (replay.match(/<button[\s\S]*?<span/g) ?? []).filter((b) =>
			b.includes('styles.stepFold')
		)
		assert.equal(folds.length, 2, 'folded and open rows')
		for (const fold of folds) {
			assert.match(fold, /type="button"/)
			assert.match(fold, /aria-expanded=/)
			assert.match(fold, /aria-controls=/)
		}
		assert.match(replay, /aria-expanded=\{false\}/)
		assert.match(replay, /aria-expanded=\{true\}/)
	})

	it('the whole trace is one control away: a pressed-state toggle and per-fold expansion', () => {
		assert.match(replay, /aria-pressed=\{full\}/)
		assert.match(replay, /Show full trace/)
		assert.match(replay, /Show every step/)
		assert.match(replay, /toggleRun\(/)
	})

	it('Next and Previous skip a fold and say so, politely, with a way to open it', () => {
		assert.match(replay, /stepFrom\(runs, index, direction, total, isOpen\)/)
		assert.match(replay, /onClick=\{\(\) => move\(1\)\}/)
		assert.match(replay, /onClick=\{\(\) => move\(-1\)\}/)
		assert.match(replay, /role="status"/)
		assert.match(replay, /steps are skipped/)
	})

	it('the list rows are buttons, the selected step is marked, and the step count is unchanged', () => {
		assert.match(replay, /aria-current=\{entry\.index === index \? 'step' : undefined\}/)
		assert.match(replay, /Step \{index \+ 1\} of \{total\}/)
	})

	it('has focus styles for the new controls', () => {
		assert.match(css, /\.foldLink:focus-visible/)
		assert.match(css, /\.checksToggle:focus-visible/)
	})

	it('adds no panel: it reuses the existing replay pane and execution history list', () => {
		assert.match(replay, /styles\.stepsList/)
		assert.doesNotMatch(replay, /<dialog|role="dialog"|createPortal/)
	})
})

describe('the Practice results summarise extra validation checks without hiding failures', () => {
	it('lists the teaching set, then one disclosure for the rest', () => {
		assert.match(results, /splitResults\(problem, result\.tests\)/)
		assert.match(results, /split\.visible\.map\(row\)/)
		assert.match(results, /<ValidationChecks/)
	})

	it('the disclosure is a keyboard-operable button with aria-expanded', () => {
		assert.match(results, /aria-expanded=\{open\}/)
		assert.match(results, /aria-controls="validation-checks"/)
		assert.match(results, /className=\{styles\.checksToggle\}/)
	})

	it('failing validation checks are always rendered; only PASSING ones wait for the press', () => {
		assert.match(results, /\{failed\.map\(row\)\}/)
		assert.match(results, /\{open && passed\.map\(row\)\}/)
	})

	it('pass/fail, the count and what is saved still come from every test', () => {
		assert.match(
			workspace,
			/result\.tests\.length > 0 && result\.tests\.every\(\(t\) => t\.passed\)/
		)
		assert.match(workspace, /testsTotal: result\.tests\.length/)
	})
})
