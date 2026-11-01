import type { TeachingPrompt } from '@/lib/trace/teach'

// The learning_events `detail` for a learner revealing guidance level 1–3, or
// null when nothing was revealed from a leveled prompt. Both guidance flavours —
// diagnosis after a failure and the optimization ladder after a pass — are
// 'diagnosis' prompts with three hints, so one format covers them: the prompt id
// plus the level, e.g. `optimise-nested-loops:L2`. A one-off question prompt has
// no levels and records nothing.
export function hintRevealDetail(prompt: TeachingPrompt, level: number): string | null {
	if (prompt == null || prompt.kind !== 'diagnosis') return null
	if (!prompt.hints.some((hint) => hint.level === level)) return null
	return `${prompt.id}:L${level}`
}
