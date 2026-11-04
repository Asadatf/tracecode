import type { StoredConversation } from './conversation-store'
import type { ExchangeOutcome } from './exchange'
import { MAX_QUESTIONS_PER_CONVERSATION, type TutorMessage } from './types'

// What an exchange's outcome does to a conversation. Pure, so the rules that
// protect the learner's 15 questions are unit tested:
//
//   done                  -> the question and the finished reply are committed,
//                            and the question counter goes up by exactly one
//   failed / cancelled    -> nothing is committed, the counter is unchanged, and
//                            the question text is kept for a one-click retry
//   stale                 -> the learner has left this conversation: no change at all
//
// A partial reply never reaches this function; only `done` carries text.

export type Settled =
	| {
			kind: 'commit'
			conversation: StoredConversation
	  }
	| {
			kind: 'rollback'
			conversation: StoredConversation
			retryText: string
			reason: 'cancelled' | 'failed'
			message: string | null
			retryable: boolean
	  }
	| { kind: 'ignore' }

export function settleExchange(args: {
	base: StoredConversation
	question: TutorMessage
	reply: TutorMessage | null
	outcome: ExchangeOutcome
	now?: string
}): Settled {
	const { base, question, reply, outcome } = args
	const now = args.now ?? new Date().toISOString()

	if (outcome.kind === 'stale') return { kind: 'ignore' }

	if (outcome.kind === 'done' && reply != null) {
		return {
			kind: 'commit',
			conversation: {
				...base,
				messages: [...base.messages, question, reply],
				questionsUsed: base.questionsUsed + 1,
				updatedAt: now
			}
		}
	}

	return {
		kind: 'rollback',
		// The transcript goes back to exactly what it was before the question.
		conversation: { ...base, updatedAt: now },
		retryText: question.text,
		reason: outcome.kind === 'cancelled' ? 'cancelled' : 'failed',
		message: outcome.kind === 'failed' ? outcome.message : null,
		retryable: outcome.kind === 'failed' ? outcome.retryable : true
	}
}

export function isLimitReached(conversation: StoredConversation): boolean {
	return conversation.questionsUsed >= MAX_QUESTIONS_PER_CONVERSATION
}
