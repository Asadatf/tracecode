import type { TutorProviderFailure, TutorProviderStream } from './tutor-provider'

// A stream that yields nothing and settles at once to a failure. Used when a
// provider is not configured. One shared copy, so the OpenAI path and the
// provider switch cannot drift apart.
export function disabledStream(reason: TutorProviderFailure): TutorProviderStream {
	return {
		deltas: {
			[Symbol.asyncIterator](): AsyncIterator<string> {
				return { next: () => Promise.resolve({ value: undefined, done: true }) }
			}
		},
		completion: Promise.resolve({ ok: false, reason }),
		abort: () => {}
	}
}
