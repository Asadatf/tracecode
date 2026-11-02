import { featuresFromAstResult, type AstResult, type CodeFeatures } from '../trace/code-features'

// Attaches code features to an attempt payload before it is saved (M7.1).
//
// Two guarantees, both easy to break by accident and so pinned by tests:
// - The features are computed from `payload.source` itself — the very string that
//   is then saved — so they can never describe a different version of the code.
// - It never rejects and never delays a save beyond the parse: an unparseable
//   source, a timeout or a dead worker all yield the payload without features,
//   exactly as the attempt would have been saved before M7.
export async function withCodeFeatures<T extends { source: string }>(
	payload: T,
	analyze: (source: string) => Promise<AstResult>
): Promise<T & { codeFeatures?: CodeFeatures }> {
	let features: CodeFeatures | null = null
	try {
		features = featuresFromAstResult(await analyze(payload.source))
	} catch {
		features = null
	}
	return features == null ? payload : { ...payload, codeFeatures: features }
}
