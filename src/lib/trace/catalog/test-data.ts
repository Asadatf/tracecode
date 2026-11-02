// Deterministic helpers for building the large official tests. Nothing here is
// random at run time: the same call always yields the same data, so a test id
// means the same input forever. Generated (not literal) so a problem's source
// stays small.

// A small linear congruential generator — enough for reproducible shuffles.
export function seededRandom(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

export function shuffled<T>(items: readonly T[], seed: number): T[] {
	const random = seededRandom(seed)
	const out = [...items]
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1))
		const a = out[i] as T
		out[i] = out[j] as T
		out[j] = a
	}
	return out
}

// `length` characters cycling through `alphabet`.
export function cycled(alphabet: string, length: number): string {
	let out = ''
	for (let i = 0; i < length; i++) out += alphabet[i % alphabet.length]
	return out
}
