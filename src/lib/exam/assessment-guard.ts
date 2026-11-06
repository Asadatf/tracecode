import { z } from 'zod'
import type { FailureCounts } from './failures'
import type { PolicyResult, PolicySummary } from './integrity-policy'

// The Daily Exam AI assessment: its evidence, its prompt and the deterministic guard its output
// must pass before it is stored (specs/features/daily-exam.md AC28, AC28a, AC28b; ADR-0011 §6).
//
// The model INTERPRETS evidence; it never supplies facts the learner sees as facts (the app renders
// those from stored data), never changes a score, rank, decision or event, and may not invent
// integrity evidence. Every statement it makes is tagged `fact` (restating supplied evidence),
// `estimate` (its judgement) or `unverified` (a browser observation that cannot establish what
// happened). Output that breaks a rule is rejected and the job retried; it is never stored.

export const EXAM_ASSESSMENT_VERSION = 'exam-assessment@1'
export const EXAM_ASSESSMENT_MAX_OUTPUT_TOKENS = 900
export const EXAM_ASSESSMENT_TIMEOUT_MS = 20_000
export const EXAM_ASSESSMENT_MAX_SOURCE_CHARS = 8_000

export const STATEMENT_TAGS = ['fact', 'estimate', 'unverified'] as const
export const SOLUTION_LEVELS = ['incomplete', 'brute_force', 'efficient', 'optimal'] as const

// The integrity categories a statement may refer to: the policy's rules and flags, or "none".
export const INTEGRITY_CATEGORIES = [
	'tab_hidden',
	'blocked_insertion',
	'fullscreen_exit',
	'window_blur',
	'screenshot_shortcut',
	'multiple_screens',
	'screen_check_unavailable',
	'camera_interruption',
	'microphone_interruption',
	'screen_capture_interruption',
	'network_interruption',
	'reporting_gap',
	'none'
] as const
export type IntegrityCategory = (typeof INTEGRITY_CATEGORIES)[number]

const text = z.string().trim().min(3).max(400)
const statement = z.object({ tag: z.enum(STATEMENT_TAGS), text }).strict()
const statements = z.array(statement).min(1).max(4)

export const examAssessmentSchema = z
	.object({
		overall: statements,
		correctnessGaps: z.array(statement).max(4),
		efficiency: z
			.object({
				timeComplexity: z.string().trim().min(1).max(40),
				spaceComplexity: z.string().trim().min(1).max(40),
				level: z.enum(SOLUTION_LEVELS),
				notes: statements
			})
			.strict(),
		timeManagement: statements,
		integrityObservations: z
			.array(
				z
					.object({
						category: z.enum(INTEGRITY_CATEGORIES),
						// An observation can restate a recorded count (fact) or say what it cannot
						// establish (unverified); it is never the model's estimate of intent.
						tag: z.enum(['fact', 'unverified']),
						text
					})
					.strict()
			)
			.min(1)
			.max(8),
		deductionExplanation: statements,
		recommendations: z.array(statement).min(1).max(5),
		summary: z.string().trim().min(10).max(500)
	})
	.strict()
export type ExamAssessment = z.infer<typeof examAssessmentSchema>

export interface AssessmentEvidence {
	problem: { title: string; statement: readonly string[]; entry: string; params: readonly string[] }
	source: string
	tests: { passed: number; total: number; failures: FailureCounts }
	time: {
		opensAt: string
		admittedAt: string
		submittedAt: string | null
		submissionKind: 'manual' | 'auto' | null
		elapsedSeconds: number | null
		remainingSeconds: number | null
	}
	integrity: {
		summary: PolicySummary
		deductions: PolicyResult['deductions']
		totalDeduction: number
	}
	// The deterministic pre-classification (AC28a), given to the model and enforced on its output.
	ignoresInputs: boolean
}

// ---- Deterministic pre-check: does the code ignore its inputs? ------------------------------

// The entry function's body never mentions any parameter (e.g. `return False`, `return 0`): it cannot
// be a real algorithm, brute force or otherwise. Comments and strings are removed first.
export function ignoresInputs(source: string, entry: string, params: readonly string[]): boolean {
	const lines = source.split('\n')
	const start = lines.findIndex((l) => new RegExp(`^\\s*def\\s+${entry}\\s*\\(`).test(l))
	if (start === -1) return true
	const indent = (l: string) => l.length - l.trimStart().length
	const base = indent(lines[start] ?? '')
	const body: string[] = []
	for (let i = start + 1; i < lines.length; i += 1) {
		const line = lines[i] ?? ''
		if (line.trim() === '') continue
		if (indent(line) <= base) break
		body.push(line)
	}
	const code = body
		.join('\n')
		.replace(/("""|''')[\s\S]*?\1/g, '')
		.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '')
		.replace(/#.*$/gm, '')
	return !params.some((p) => new RegExp(`\\b${p}\\b`).test(code))
}

// Which integrity categories the recorded evidence actually contains.
export function presentCategories(
	summary: PolicySummary,
	deductions: PolicyResult['deductions']
): Set<IntegrityCategory> {
	const present = new Set<IntegrityCategory>(['none'])
	for (const d of deductions) present.add(d.rule)
	if (summary.tabHides > 0) present.add('tab_hidden')
	if (summary.blockedInsertions > 0) present.add('blocked_insertion')
	if (summary.fullscreenExits > 0) present.add('fullscreen_exit')
	if (summary.windowBlurs > 0) present.add('window_blur')
	if (summary.screenshotShortcuts > 0) present.add('screenshot_shortcut')
	if (summary.maxScreensReported != null && summary.maxScreensReported > 1)
		present.add('multiple_screens')
	if (summary.screenCheck === 'unsupported' || summary.screenCheck === 'denied')
		present.add('screen_check_unavailable')
	if (summary.mediaInterruptions.camera > 0) present.add('camera_interruption')
	if (summary.mediaInterruptions.microphone > 0) present.add('microphone_interruption')
	if (summary.mediaInterruptions.screen > 0) present.add('screen_capture_interruption')
	if (summary.networkInterruptions > 0) present.add('network_interruption')
	if (summary.reportingGaps > 0) present.add('reporting_gap')
	return present
}

// ---- The guard -------------------------------------------------------------------------------

const CODE_IN_TEXT = /```|\bdef \w+\s*\(|\bimport \w+|^\s{4,}\S/m
// Assertions of misconduct or of things no browser can observe.
const MISCONDUCT =
	/\b(cheat(?:ed|ing|s)?|dishonest(?:y|ly)?|misconduct|plagiari[sz](?:ed|m|ing)|copied (?:from|it)|looked up the (?:answer|solution)|used (?:chatgpt|an ai|ai|another person|a second device)|someone (?:else )?helped|was helped by|external help (?:was|is) (?:used|confirmed|proven)|violat(?:ed|ion) (?:proves|is proven))\b/i
const CERTAINTY = /\b(proves?|proven|proof that|certainly|definitely|guarantee[sd]?)\b/i
// "screenshot" is allowed only as the exact observation "screenshot shortcut".
const SCREENSHOT_CLAIM = /screenshots?(?!\s+shortcuts?)/i

export type GuardResult = { ok: true; assessment: ExamAssessment } | { ok: false; reason: string }

export function guardExamAssessment(raw: unknown, evidence: AssessmentEvidence): GuardResult {
	const parsed = examAssessmentSchema.safeParse(raw)
	if (!parsed.success) return { ok: false, reason: 'schema' }
	const a = parsed.data
	const allText = [
		...a.overall,
		...a.correctnessGaps,
		...a.efficiency.notes,
		...a.timeManagement,
		...a.integrityObservations,
		...a.deductionExplanation,
		...a.recommendations
	]
		.map((s) => s.text)
		.concat(a.summary)
		.join('\n')
	if (CODE_IN_TEXT.test(allText)) return { ok: false, reason: 'code' }
	if (MISCONDUCT.test(allText)) return { ok: false, reason: 'misconduct_claim' }
	if (SCREENSHOT_CLAIM.test(allText)) return { ok: false, reason: 'screenshot_claim' }
	if (CERTAINTY.test(allText)) return { ok: false, reason: 'certainty' }
	const present = presentCategories(evidence.integrity.summary, evidence.integrity.deductions)
	if (a.integrityObservations.some((o) => !present.has(o.category)))
		return { ok: false, reason: 'absent_integrity_category' }
	// A clean record is described as clean, not filled with speculation.
	if (present.size === 1 && a.integrityObservations.some((o) => o.category !== 'none'))
		return { ok: false, reason: 'absent_integrity_category' }
	if (evidence.ignoresInputs && a.efficiency.level !== 'incomplete')
		return { ok: false, reason: 'incomplete_not_acknowledged' }
	if (
		!evidence.ignoresInputs &&
		evidence.tests.passed === evidence.tests.total &&
		a.efficiency.level === 'incomplete'
	)
		return { ok: false, reason: 'full_pass_called_incomplete' }
	return { ok: true, assessment: a }
}

// ---- The prompt ------------------------------------------------------------------------------

export function buildExamAssessmentPrompt(e: AssessmentEvidence): { system: string; user: string } {
	const system = [
		'You write a learning assessment of one programming-exam submission for the learner who wrote it.',
		'Reply with ONLY a JSON object with exactly these keys: overall, correctnessGaps, efficiency {timeComplexity, spaceComplexity, level, notes}, timeManagement, integrityObservations, deductionExplanation, recommendations, summary.',
		'Every statement is {"tag": "fact"|"estimate"|"unverified", "text": "..."}: "fact" only to restate evidence given below, "estimate" for your judgement (complexity, approach, quality), "unverified" for browser observations, which can never establish what actually happened.',
		'level is one of incomplete, brute_force, efficient, optimal. If the evidence says the code ignores its inputs, level MUST be incomplete and you must call it incomplete, never a brute-force algorithm.',
		'integrityObservations: one entry per recorded category (or a single {"category": "none"} if nothing was recorded), tag "fact" when restating a count and "unverified" when saying what it cannot show. Never accuse, never infer cheating, intent or outside help from these signals, and never say a screenshot was taken: at most "a possible screenshot shortcut was observed".',
		'deductionExplanation explains only the deductions listed, by the rule given. You cannot change any score, rank or deduction.',
		'Never write code, never reveal or guess hidden test inputs or expected outputs, never give a full solution.'
	].join('\n')
	const user = JSON.stringify({
		problem: e.problem,
		submittedCode: e.source.slice(0, EXAM_ASSESSMENT_MAX_SOURCE_CHARS),
		tests: e.tests,
		time: e.time,
		integrity: {
			note: 'All integrity facts were reported by the browser; they are observations, not proof.',
			...e.integrity
		},
		codeIgnoresInputs: e.ignoresInputs
	})
	return { system, user }
}
